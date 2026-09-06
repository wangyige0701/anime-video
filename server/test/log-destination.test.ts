import { EventEmitter, once } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { Worker } from 'node:worker_threads';
import pino from 'pino';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LogDestination } from '~server/src/log-destination';
import { LOG_CLOSE } from '~server/src/log-protocol';

const temporaryDirectories: string[] = [];
const execute = promisify(execFile);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

class SlowTransport extends EventEmitter {
	readonly writes: string[] = [];
	readonly callbacks: ((error?: Error) => void)[] = [];
	readonly end = vi.fn();
	readonly worker = {
		terminate: vi.fn(async () => {
			this.emit('close');
			return 0;
		}),
	};

	constructor() {
		super();
		this.on('message', (message) => {
			if (message.code === LOG_CLOSE) {
				this.emit('close');
			}
		});
	}

	write(data: string) {
		this.writes.push(data);
		return false;
	}

	flush(callback: (error?: Error) => void) {
		this.callbacks.push(callback);
	}

	acknowledge() {
		this.callbacks.shift()?.();
	}
}

describe('log destination', () => {
	it('bounds queued plus in-flight bytes, reports drops and resumes after slow writes', async () => {
		const transport = new SlowTransport();
		const report = vi.fn();
		const destination = new LogDestination(transport, 16, report);
		destination.write('a'.repeat(8));
		destination.write('b'.repeat(8));
		await nextTurn();
		destination.write('c'.repeat(8));
		expect(destination.bufferedBytes).toBe(16);
		expect(transport.writes).toEqual(['a'.repeat(8) + 'b'.repeat(8)]);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('queue full'));
		transport.acknowledge();
		expect(destination.bufferedBytes).toBe(0);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('Dropped 1'));
		destination.write('d'.repeat(8));
		await nextTurn();
		const closing = destination.close();
		expect(destination.close()).toBe(closing);
		transport.acknowledge();
		await closing;
		expect(transport.writes[1]).toBe('d'.repeat(8));
		expect(transport.end).not.toHaveBeenCalled();
	});

	it('rejects a single oversized record without exceeding the byte limit', async () => {
		const transport = new SlowTransport();
		const report = vi.fn();
		const destination = new LogDestination(transport, 4, report);
		destination.write('中文');
		expect(destination.bufferedBytes).toBe(0);
		expect(transport.writes).toEqual([]);
		const closing = destination.close();
		transport.acknowledge();
		await closing;
		expect(report).toHaveBeenCalledWith(expect.stringContaining('Dropped 1'));
	});

	it('propagates worker errors that happen before close and clears the queue', async () => {
		const transport = new SlowTransport();
		const report = vi.fn();
		const destination = new LogDestination(transport, 64, report);
		destination.write('record\n');
		const error = new Error('worker failed');
		transport.emit('error', error);
		await expect(destination.close()).rejects.toBe(error);
		expect(destination.bufferedBytes).toBe(0);
		expect(report).toHaveBeenCalledOnce();
	});

	it('rejects an unexpected worker close while accepted records are still pending', async () => {
		const transport = new SlowTransport();
		const destination = new LogDestination(transport, 64, vi.fn());
		destination.write('record\n');
		const closing = destination.close();
		transport.emit('close');
		await expect(closing).rejects.toThrow('closed unexpectedly');
		expect(destination.bufferedBytes).toBe(0);
	});

	it('times out asynchronously, terminates a stuck worker and ignores late acknowledgments', async () => {
		const transport = new SlowTransport();
		const destination = new LogDestination(transport, 64, vi.fn());
		destination.write('record\n');
		const eventLoopProgress = vi.fn();
		setImmediate(eventLoopProgress);
		await expect(destination.close(25)).rejects.toThrow('timed out');
		expect(eventLoopProgress).toHaveBeenCalledOnce();
		expect(transport.worker.terminate).toHaveBeenCalledOnce();
		transport.acknowledge();
		expect(destination.bufferedBytes).toBe(0);
	});
});

describe('Pino worker integration', () => {
	beforeAll(async () => {
		// 真实 worker 必须验证本次源码生成的产物，不能复用可能过期的 dist 文件。
		await execute(
			process.execPath,
			[require.resolve('typescript/bin/tsc'), '-p', 'server/tsconfig.log-transport.json'],
			{ cwd: repo },
		);
	});

	it('drains real console and file output and closes before the timeout', async () => {
		const directory = await temporaryDirectory();
		const transport = pino.transport({
			target: path.join(repo, 'server/dist/log-transport.js'),
			worker: { autoEnd: false, stdout: true },
			options: {
				logDir: directory,
				consoleFormat: 'json',
				maxBytes: 52428800,
				bufferBytes: 1024,
				flushIntervalMs: 250,
				retentionDays: 0,
				components: ['app'],
				sources: ['default'],
				httpEventSource: {},
				httpBusinessPrefixes: [],
			},
		});
		const worker: Worker = Reflect.get(transport, 'worker');
		let stdout = '';
		worker.stdout!.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		const destination = new LogDestination(transport, 4 * 1024 * 1024);
		const logger = pino({ base: { component: 'app' } }, destination);
		for (let index = 0; index < 2000; index++) {
			logger.info({ index }, 'integration record');
		}
		const timeout = new Promise<never>((_resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('integration close stalled')), 2000);
			transport.once('close', () => clearTimeout(timer));
		});
		await Promise.race([destination.close(), timeout]);
		expect(stdout.trim().split('\n')).toHaveLength(2000);
		const dates = await readdir(path.join(directory, 'app'));
		const saved = await readFile(path.join(directory, 'app', dates[0]!, 'default.0001.ndjson'), 'utf8');
		expect(saved).toBe(stdout);
		expect(
			saved
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line).index),
		).toEqual(Array.from({ length: 2000 }, (_, index) => index));
	});

	it.each([
		['production', false, true],
		['production', true, true],
		['development', false, false],
	] as const)('runs the actual logger in %s (natural exit: %s, files: %s)', async (mode, naturalExit, files) => {
		const directory = await temporaryDirectory();
		const result = await execute(
			process.execPath,
			[
				'--import',
				pathToFileURL(require.resolve('tsx')).href,
				path.join(repo, 'server/test/fixtures/logger-process.ts'),
				...(naturalExit ? ['--natural'] : []),
			],
			{
				cwd: repo,
				env: {
					...process.env,
					NODE_ENV: mode,
					LOGGING_DIRECTORY: directory,
					LOGGING_FILE_ENABLED: String(files),
				},
				timeout: 5000,
				windowsHide: true,
			},
		);
		expect(result.stderr).toBe('');
		expect(result.stdout.match(/integration log/g)).toHaveLength(10);
		if (files) {
			const dates = await readdir(path.join(directory, 'http'));
			const saved = await readFile(path.join(directory, 'http', dates[0]!, 'access.0001.ndjson'), 'utf8');
			expect(saved).toBe(result.stdout);
		} else {
			expect(await readdir(directory)).toEqual([]);
		}
	});

	it('terminates a real worker whose final callback never completes', async () => {
		const transport = pino.transport({
			target: path.join(repo, 'server/test/fixtures/stalled-log-transport.mjs'),
			worker: { autoEnd: false },
		});
		const worker: Worker = Reflect.get(transport, 'worker');
		const exited = once(worker, 'exit');
		const destination = new LogDestination(transport, 1024, vi.fn());
		destination.write(`${JSON.stringify({ level: 30, msg: 'stalled close' })}\n`);
		await expect(destination.close(150)).rejects.toThrow('timed out');
		await exited;
	});
});

async function temporaryDirectory() {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-log-worker-'));
	temporaryDirectories.push(directory);
	return directory;
}
