import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import createLogTransport from '~server/src/log-transport';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe('log transport', () => {
	it('reassembles chunks and routes records to controlled files', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const transport = createLogTransport({
			logDir: directory,
			environment: 'Test/Environment',
			bufferBytes: 1024 * 1024,
			pid: 1234,
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
		const accessPath = path.join(directory, 'test-environment', 'http', date, 'http.access.1234.0001.ndjson');
		const fallbackPath = path.join(directory, 'test-environment', 'app', date, 'app.default.1234.0001.ndjson');
		expect(await readFile(accessPath, 'utf8')).toBe(`${accessRecord}\n`);
		expect(await readFile(fallbackPath, 'utf8')).toBe(`${fallbackRecord}\n`);
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
		const transport = createLogTransport({
			logDir: directory,
			maxBytes: Buffer.byteLength(line) + 1,
			bufferBytes: 1024 * 1024,
			pid: 55,
		});

		await writeChunk(transport, line.repeat(3));
		await finish(transport);

		const dateDirectory = path.join(directory, 'development', 'app', dateName(timestamp));
		const names = (await readdir(dateDirectory)).sort();
		expect(names).toEqual([
			'app.business.55.0001.ndjson',
			'app.business.55.0002.ndjson',
			'app.business.55.0003.ndjson',
		]);
		for (const name of names) {
			expect((await readFile(path.join(dateDirectory, name), 'utf8')).split('\n').filter(Boolean)).toHaveLength(
				1,
			);
		}
	});

	it('resumes an unfinished file and flushes buffered data on close', async () => {
		const directory = await createTemporaryDirectory();
		const timestamp = Date.now();
		const options = { logDir: directory, maxBytes: 1024, bufferBytes: 1024 * 1024, pid: 77 };
		const first = createLogTransport(options);
		const firstRecord = JSON.stringify({ component: 'web', source: 'startup', time: timestamp, step: 1 });
		await writeChunk(first, `${firstRecord}\n`);
		await finish(first);

		const second = createLogTransport(options);
		const secondRecord = JSON.stringify({ component: 'web', source: 'startup', time: timestamp, step: 2 });
		await writeChunk(second, `${secondRecord}\n`);
		await finish(second);

		const filePath = path.join(directory, 'development', 'web', dateName(timestamp), 'web.startup.77.0001.ndjson');
		expect(await readFile(filePath, 'utf8')).toBe(`${firstRecord}\n${secondRecord}\n`);
	});

	it('removes expired date directories during startup', async () => {
		const directory = await createTemporaryDirectory();
		const expired = path.join(directory, 'development', 'app', '2020-01-01');
		await mkdir(expired, { recursive: true });
		await writeFile(path.join(expired, 'old.ndjson'), 'old\n');

		const transport = createLogTransport({
			logDir: directory,
			retentionDays: 1,
			bufferBytes: 1024,
			pid: 88,
		});
		await finish(transport);

		expect(await exists(path.join(directory, 'development', 'app', '2020-01-01'))).toBe(false);
	});
});

async function createTemporaryDirectory() {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-video-log-'));
	temporaryDirectories.push(directory);
	return directory;
}

function writeChunk(transport: Writable, chunk: string) {
	return new Promise<void>((resolve, reject) => {
		transport.write(chunk, 'utf8', (error) => (error ? reject(error) : resolve()));
	});
}

function finish(transport: Writable) {
	return new Promise<void>((resolve, reject) => {
		transport.once('error', reject);
		transport.end(() => resolve());
	});
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
