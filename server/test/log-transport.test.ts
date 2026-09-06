import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import buildLogTransport from '~server/src/log-transport';

// 保留真实文件系统，仅让故障测试能替换原生 ESM 的只读导出。
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));
vi.mock('node:fs/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs/promises')>()),
}));

const temporaryDirectories: string[] = [];
const transports: Writable[] = [];

afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	await Promise.all(
		transports.splice(0).map(async (transport) => {
			const done = finished(transport).catch(() => {});
			transport.end();
			await done;
		}),
	);
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe('log transport', () => {
	it('reassembles chunks and routes records to controlled files', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = await createLogTransport({
			...transportConfig,
			logDir: directory,
			bufferBytes: 1024 * 1024,
		});
		const accessRecord = JSON.stringify({
			component: 'http',
			event: 'http.request.completed',
			time: timestamp,
		});
		const fallbackRecord = JSON.stringify({ component: 'unknown', source: 'unknown', time: timestamp });

		await writeChunk(transport, accessRecord.slice(0, -1));
		await writeChunk(transport, `${accessRecord.slice(-1)}\n${fallbackRecord}\n`);
		await finish(transport);

		const date = dateName(timestamp);
		const accessPath = path.join(directory, 'http', date, 'access.0001.ndjson');
		const fallbackPath = path.join(directory, 'app', date, 'default.0001.ndjson');
		expect(await readFile(accessPath, 'utf8')).toBe(`${accessRecord}\n`);
		expect(await readFile(fallbackPath, 'utf8')).toBe(`${fallbackRecord}\n`);
	});

	it('preserves UTF-8 across Buffer boundaries and flushes an unterminated final line', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = await createLogTransport({ ...transportConfig, logDir: directory });
		const record = JSON.stringify({ component: 'app', time: timestamp, msg: '中文日志' });
		const data = Buffer.from(record);
		const boundary = data.indexOf(Buffer.from('中')) + 1;
		transport.cork();
		transport.write(data.subarray(0, boundary));
		transport.write(data.subarray(boundary));
		transport.uncork();
		await finish(transport);
		expect(await readFile(path.join(directory, 'app', dateName(timestamp), 'default.0001.ndjson'), 'utf8')).toBe(
			`${record}\n`,
		);
	});

	it('falls back from invalid dates and non-object JSON without losing raw records', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = await createLogTransport({ ...transportConfig, logDir: directory });
		const dated = `${JSON.stringify({ time: 1e20 })}\n${JSON.stringify({ time: -Infinity })}\n`;
		const invalid = 'null\n[]\ninvalid-json\n';
		await writeChunk(transport, dated + invalid);
		await finish(transport);
		const date = dateName(timestamp);
		expect(await readdir(path.join(directory, 'app'))).toEqual([date]);
		expect(await readFile(path.join(directory, 'app', date, 'default.0001.ndjson'), 'utf8')).toBe(dated);
		expect(await readFile(path.join(directory, 'app', date, 'transport.0001.ndjson'), 'utf8')).toBe(invalid);
	});

	it('flushes low-volume logs on the timer before the transport closes', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, flushIntervalMs: 15 });
		const record = `${JSON.stringify({ time: timestamp })}\n`;
		await writeChunk(transport, record);
		await vi.waitFor(async () => {
			expect(
				await readFile(path.join(directory, 'app', dateName(timestamp), 'default.0001.ndjson'), 'utf8'),
			).toBe(record);
		});
		expect(transport.writableEnded).toBe(false);
	});

	it('forwards asynchronous timer write errors and closes every open file', async () => {
		const directory = await createTemporaryDirectory();
		const streams: fs.WriteStream[] = [];
		const create = fs.createWriteStream;
		const error = Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' });
		vi.spyOn(fs, 'createWriteStream').mockImplementation((file, options) => {
			const stream = create(file, options);
			streams.push(stream);
			if (String(file).includes('default.')) {
				vi.spyOn(stream, '_write').mockImplementation((_chunk, _encoding, callback) => {
					setImmediate(() => callback(error));
				});
			}
			return stream;
		});
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, flushIntervalMs: 20 });
		const failed = once(transport, 'error');
		const closed = new Promise<void>((resolve) => transport.once('close', resolve));
		await writeChunk(
			transport,
			`${JSON.stringify({ source: 'business' })}\n${JSON.stringify({ source: 'default' })}\n`,
		);
		expect((await failed)[0]).toBe(error);
		await closed;
		expect(streams).toHaveLength(2);
		expect(streams.every((stream) => stream.closed)).toBe(true);
	});

	it('keeps write callbacks pending while disk I/O is blocked', async () => {
		const directory = await createTemporaryDirectory();
		const create = fs.createWriteStream;
		let unblock!: () => void;
		const started = new Promise<void>((resolve) => {
			vi.spyOn(fs, 'createWriteStream').mockImplementation((file, options) => {
				const stream = create(file, options);
				const write = stream._write.bind(stream);
				vi.spyOn(stream, '_write').mockImplementationOnce((chunk, encoding, callback) => {
					unblock = () => write(chunk, encoding, callback);
					resolve();
				});
				return stream;
			});
		});
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, bufferBytes: 8 });
		const callback = vi.fn();
		expect(transport.write(`${JSON.stringify({ msg: 'slow disk' })}\n`, callback)).toBe(false);
		await started;
		expect(callback).not.toHaveBeenCalled();
		unblock();
		await finish(transport);
		expect(callback).toHaveBeenCalledExactlyOnceWith(null);
	});

	it('does not block first writes behind startup cleanup', async () => {
		const directory = await createTemporaryDirectory();
		const read = fsPromises.readdir;
		let unblock!: () => void;
		const gate = new Promise<void>((resolve) => {
			unblock = resolve;
		});
		vi.spyOn(fsPromises, 'readdir').mockImplementation(async (...args: Parameters<typeof read>) => {
			if (String(args[0]) === directory) {
				await gate;
			}
			return read(...args);
		});
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, bufferBytes: 1 });
		try {
			await writeChunk(transport, `${JSON.stringify({ msg: 'first write' })}\n`);
			expect(await exists(path.join(directory, 'app'))).toBe(true);
		} finally {
			unblock();
		}
	});

	it('cleans expired dates after midnight, releases old writers and permits later recreation', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		vi.setSystemTime(new Date(2026, 8, 6, 23, 59, 59));
		const directory = await createTemporaryDirectory();
		const oldTimestamp = new Date(2026, 8, 5, 12).getTime();
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, retentionDays: 1 });
		await writeChunk(transport, `${JSON.stringify({ time: oldTimestamp })}\n`);
		const oldDirectory = path.join(directory, 'app', '2026-09-05');
		expect(await exists(oldDirectory)).toBe(true);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.waitFor(async () => expect(await exists(oldDirectory)).toBe(false));
		const lateRecord = `${JSON.stringify({ time: oldTimestamp, late: true })}\n`;
		await writeChunk(transport, lateRecord);
		await finish(transport);
		expect(await readFile(path.join(oldDirectory, 'default.0001.ndjson'), 'utf8')).toBe(lateRecord);
	});

	it('allows retentionDays zero to disable cleanup', async () => {
		const directory = await createTemporaryDirectory();
		const oldDirectory = path.join(directory, 'app', '2020-01-01');
		await mkdir(oldDirectory, { recursive: true });
		const transport = await createLogTransport({ ...transportConfig, logDir: directory, retentionDays: 0 });
		await finish(transport);
		expect(await exists(oldDirectory)).toBe(true);
	});

	it('waits for a concurrent cleanup attempt before reopening an old date', async () => {
		const directory = await createTemporaryDirectory();
		const oldDirectory = path.join(directory, 'app', '2020-01-01');
		await mkdir(oldDirectory, { recursive: true });
		const remove = fsPromises.rm;
		let unblock!: () => void;
		const gate = new Promise<void>((resolve) => {
			unblock = resolve;
		});
		let started!: () => void;
		const removalStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		vi.spyOn(fsPromises, 'rm').mockImplementation(async (...args) => {
			if (String(args[0]) === oldDirectory) {
				started();
				await gate;
			}
			return remove(...args);
		});
		const transport = await createLogTransport({ ...transportConfig, logDir: directory });
		await removalStarted;
		const record = `${JSON.stringify({ time: new Date(2020, 0, 1, 12).getTime(), msg: 'late record' })}\n`;
		const completed = vi.fn();
		const writing = writeChunk(transport, record).then(completed);
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(completed).not.toHaveBeenCalled();
		unblock();
		await writing;
		await finish(transport);
		expect(await readFile(path.join(oldDirectory, 'default.0001.ndjson'), 'utf8')).toBe(record);
	});

	it('reports cleanup failures without failing new writes', async () => {
		const directory = await createTemporaryDirectory();
		await mkdir(path.join(directory, 'app', '2020-01-01'), { recursive: true });
		vi.spyOn(fsPromises, 'rm').mockRejectedValueOnce(new Error('cleanup denied'));
		const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const transport = await createLogTransport({ ...transportConfig, logDir: directory });
		await writeChunk(transport, `${JSON.stringify({ msg: 'current log' })}\n`);
		await finish(transport);
		expect(warning).toHaveBeenCalledWith(expect.stringContaining('cleanup denied'));
		expect(transport.errored).toBeNull();
	});

	it('rotates files when the byte limit is reached', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const line = `${JSON.stringify({
			component: 'app',
			source: 'business',
			time: timestamp,
			message: 'x'.repeat(48),
		})}\n`;
		const transport = await createLogTransport({
			...transportConfig,
			logDir: directory,
			maxBytes: Buffer.byteLength(line) + 1,
			bufferBytes: 1024 * 1024,
		});

		await writeChunk(transport, line.repeat(3));
		await finish(transport);

		const dateDirectory = path.join(directory, 'app', dateName(timestamp));
		const names = (await readdir(dateDirectory)).sort();
		expect(names).toEqual(['business.0001.ndjson', 'business.0002.ndjson', 'business.0003.ndjson']);
		for (const name of names) {
			expect((await readFile(path.join(dateDirectory, name), 'utf8')).split('\n').filter(Boolean)).toHaveLength(
				1,
			);
		}
	});

	it('uses configured HTTP event routes and keeps unmapped values in the default file', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = await createLogTransport({
			...transportConfig,
			logDir: directory,
			httpEventSource: {
				'custom.event': 'business',
				'unsafe.event': '../outside',
			},
			bufferBytes: 1024 * 1024,
		});
		const configuredRecord = JSON.stringify({ component: 'http', event: 'custom.event', time: timestamp });
		const fallbackRecord = JSON.stringify({ component: 'http', event: 'unsafe.event', time: timestamp });

		await writeChunk(transport, `${configuredRecord}\n${fallbackRecord}\n`);
		await finish(transport);

		const date = dateName(timestamp);
		expect(await readFile(path.join(directory, 'http', date, 'business.0001.ndjson'), 'utf8')).toBe(
			`${configuredRecord}\n`,
		);
		expect(await readFile(path.join(directory, 'http', date, 'default.0001.ndjson'), 'utf8')).toBe(
			`${fallbackRecord}\n`,
		);
		expect(await exists(path.join(directory, 'outside'))).toBe(false);
	});

	it('resumes an unfinished file and flushes buffered data on close', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const options = { ...transportConfig, logDir: directory, maxBytes: 1024, bufferBytes: 1024 * 1024 };
		const first = await createLogTransport(options);
		const firstRecord = JSON.stringify({ component: 'web', source: 'startup', time: timestamp, step: 1 });
		await writeChunk(first, `${firstRecord}\n`);
		await finish(first);

		const second = await createLogTransport(options);
		const secondRecord = JSON.stringify({ component: 'web', source: 'startup', time: timestamp, step: 2 });
		await writeChunk(second, `${secondRecord}\n`);
		await finish(second);

		const filePath = path.join(directory, 'web', dateName(timestamp), 'startup.0001.ndjson');
		expect(await readFile(filePath, 'utf8')).toBe(`${firstRecord}\n${secondRecord}\n`);
	});

	it('removes expired date directories during startup', async () => {
		const directory = await createTemporaryDirectory();
		const expired = path.join(directory, 'app', '2020-01-01');
		await mkdir(expired, { recursive: true });
		await writeFile(path.join(expired, 'old.ndjson'), 'old\n');

		const transport = await createLogTransport({
			...transportConfig,
			logDir: directory,
			retentionDays: 1,
			bufferBytes: 1024,
		});
		await finish(transport);

		expect(await exists(path.join(directory, 'app', '2020-01-01'))).toBe(false);
	});
});

async function createTemporaryDirectory() {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-video-log-'));
	temporaryDirectories.push(directory);
	return directory;
}

async function createLogTransport(options: Parameters<typeof buildLogTransport>[0]) {
	const transport = await buildLogTransport(options);
	transports.push(transport);
	return transport;
}

const transportConfig = {
	maxBytes: 50 * 1024 * 1024,
	retentionDays: 30,
	bufferBytes: 64 * 1024,
	flushIntervalMs: 250,
	components: ['app', 'http', 'web', 'hls'],
	sources: [
		'access',
		'business',
		'error',
		'startup',
		'shutdown',
		'native',
		'manager',
		'request',
		'transport',
		'default',
	],
	httpEventSource: {
		'http.request.completed': 'access',
		'http.request.failed': 'error',
		'http.request.rejected': 'error',
	},
	httpBusinessPrefixes: ['series.', 'season.', 'episode.', 'directories.', 'system.'],
};

function writeChunk(transport: Writable, chunk: string) {
	return new Promise<void>((resolve, reject) => {
		transport.write(chunk, 'utf8', (error) => (error ? reject(error) : resolve()));
	});
}

function finish(transport: Writable) {
	const done = finished(transport);
	transport.end();
	return done;
}

function dateName(timestamp: number) {
	const date = new Date(timestamp);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

async function exists(filePath: string) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}
