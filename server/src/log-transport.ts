import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { parentPort } from 'node:worker_threads';
import { LOG_CLOSE } from './log-protocol.js';

interface FileOptions {
	logDir: string;
	maxBytes: number;
	bufferBytes: number;
	flushIntervalMs: number;
}

interface TransportOptions extends Omit<FileOptions, 'logDir'> {
	logDir?: string;
	fileEnabled?: boolean;
	consoleFormat?: 'json' | 'pretty';
	retentionDays: number;
	components: string[];
	sources: string[];
	httpEventSource: Record<string, string>;
	httpBusinessPrefixes: string[];
}

interface ResolvedOptions extends FileOptions {
	fileEnabled: boolean;
	retentionDays: number;
	components: Set<string>;
	sources: Set<string>;
	httpEventSource: Map<string, string>;
	httpBusinessPrefixes: string[];
}

type LogRecord = Record<string, unknown>;
type Callback = (error?: Error | null) => void;
type Pretty = (record: LogRecord) => string;

export default async function createLogTransport(options: TransportOptions) {
	let pretty: Pretty | undefined;
	if (options.consoleFormat === 'pretty') {
		const { prettyFactory } = await import('pino-pretty');
		pretty = prettyFactory({ colorize: true, ignore: 'pid,hostname', translateTime: 'SYS:standard' });
	}
	return new LogTransport(options, pretty);
}

/** 单个 worker 同时处理控制台和文件，避免多 target 分发丢失下游背压。 */
class LogTransport extends Writable {
	private readonly options: ResolvedOptions;
	private readonly writers = new Map<string, LogFileWriter>();
	private readonly decoder = new StringDecoder('utf8');
	private readonly directoryUsers = new Map<string, number>();
	private readonly removals = new Map<string, Promise<void>>();
	private readonly consoleEnabled: boolean;
	private pending = '';
	private processing: Promise<void> = Promise.resolve();
	private cleanup: Promise<void> = Promise.resolve();
	private cleanupTimer: NodeJS.Timeout | undefined;
	private stopping = false;
	private readonly onConsoleError = (error: Error) => this.destroy(error);
	private readonly onMessage = (message: { code?: unknown } | null) => {
		if (message?.code === LOG_CLOSE) {
			this.end();
		}
	};

	constructor(
		options: TransportOptions,
		private readonly pretty?: Pretty,
	) {
		super({ highWaterMark: positiveInteger(options.bufferBytes, 'bufferBytes') });
		this.options = {
			logDir: options.logDir || path.resolve(process.cwd(), 'logs'),
			fileEnabled: options.fileEnabled !== false,
			maxBytes: positiveInteger(options.maxBytes, 'maxBytes'),
			retentionDays: nonNegativeInteger(options.retentionDays, 'retentionDays'),
			bufferBytes: options.bufferBytes,
			flushIntervalMs: positiveInteger(options.flushIntervalMs, 'flushIntervalMs'),
			components: new Set(options.components.map(safeToken)),
			sources: new Set(options.sources.map(safeToken)),
			httpEventSource: new Map(
				Object.entries(options.httpEventSource).map(([event, source]) => [event, safeToken(source)]),
			),
			httpBusinessPrefixes: options.httpBusinessPrefixes,
		};
		this.consoleEnabled = options.consoleFormat !== undefined;
		if (this.consoleEnabled) {
			process.stdout.on('error', this.onConsoleError);
		}
		parentPort?.on('message', this.onMessage);
		if (this.options.fileEnabled && this.options.retentionDays > 0) {
			// 清理独立运行，正常日期的首次写入不必等待历史目录扫描。
			this.startCleanup();
		}
	}

	_write(chunk: Buffer, _encoding: BufferEncoding, callback: Callback) {
		// Writable 已保证 _write/_writev 串行，不再叠加 chunk Promise 队列。
		this.processing = this.processChunk(this.decoder.write(chunk));
		void this.processing.then(() => callback(), callback);
	}

	_writev(chunks: { chunk: Buffer; encoding: BufferEncoding }[], callback: Callback) {
		const data = chunks.map(({ chunk }) => this.decoder.write(chunk)).join('');
		this.processing = this.processChunk(data);
		void this.processing.then(() => callback(), callback);
	}

	_final(callback: Callback) {
		this.stopCleanup();
		this.processing = (async () => {
			this.pending += this.decoder.end();
			if (this.pending) {
				await this.processChunk('\n');
			}
			await this.cleanup;
			await this.closeWriters();
		})();
		void this.processing.then(() => callback(), callback);
	}

	_destroy(error: Error | null, callback: Callback) {
		this.stopCleanup();
		parentPort?.off('message', this.onMessage);
		// 先中止文件 I/O，唤醒可能等待写入的任务，再等待资源释放。
		if (!this.writableFinished) {
			for (const writer of this.writers.values()) {
				writer.abort(error || new Error('Log transport destroyed'));
			}
		}
		const complete = (closeError?: Error) => {
			process.stdout.off('error', this.onConsoleError);
			this.writers.clear();
			this.pending = '';
			callback(error || closeError);
		};
		void Promise.allSettled([this.processing, this.cleanup])
			.then(() => this.closeWriters())
			.then(() => complete(), complete);
	}

	private async closeWriters() {
		const results = await Promise.allSettled([...this.writers.values()].map((writer) => writer.close()));
		const failure = results.find((result) => result.status === 'rejected');
		if (failure?.status === 'rejected') {
			throw failure.reason;
		}
	}

	private async processChunk(chunk: string) {
		const lines = (this.pending + chunk).split('\n');
		this.pending = lines.pop() || '';
		const batches: { date: string; component: string; source: string; data: string }[] = [];
		let consoleData = '';
		for (const line of lines) {
			if (!line) {
				continue;
			}
			let record: LogRecord;
			try {
				const parsed: unknown = JSON.parse(line);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					throw new Error('Expected a log object');
				}
				record = parsed as LogRecord;
			} catch {
				record = { component: 'app', source: 'transport', time: Date.now(), msg: line };
			}
			if (this.consoleEnabled) {
				consoleData += this.pretty ? this.pretty(record) : `${line}\n`;
			}
			if (!this.options.fileEnabled) {
				continue;
			}
			const component = getComponent(record, this.options.components);
			const source = getSource(record, component, this.options);
			const date = getDate(record.time);
			const last = batches[batches.length - 1];
			if (last && last.component === component && last.source === source && last.date === date) {
				last.data += `${line}\n`;
			} else {
				batches.push({ component, source, date, data: `${line}\n` });
			}
		}
		// 控制台也等待实际写入回调，慢输出不会绕过 worker 的背压。
		if (consoleData) {
			await writeData(process.stdout, consoleData);
		}
		for (const batch of batches) {
			if (this.destroyed) {
				throw this.errored || new Error('Log transport destroyed');
			}
			const key = `${batch.component}\0${batch.source}`;
			let writer = this.writers.get(key);
			if (!writer) {
				writer = new LogFileWriter(
					{ ...this.options, component: batch.component, source: batch.source },
					(directory) => this.acquireDirectory(directory),
					(error) => this.destroy(error),
				);
				this.writers.set(key, writer);
			}
			await writer.appendBatch(batch.date, batch.data);
		}
	}

	private async acquireDirectory(directory: string) {
		// 删除期间登记任务；晚到的历史日志等待删除完成后重新建目录。
		const removal = this.removals.get(directory);
		if (removal) {
			await removal.catch(() => {});
		}
		this.directoryUsers.set(directory, (this.directoryUsers.get(directory) || 0) + 1);
		return () => {
			const users = (this.directoryUsers.get(directory) || 1) - 1;
			if (users) {
				this.directoryUsers.set(directory, users);
			} else {
				this.directoryUsers.delete(directory);
			}
		};
	}

	private startCleanup() {
		this.cleanup = this.cleanupOldLogs().catch((error: unknown) => {
			process.stderr.write(`[log-transport] Log cleanup failed: ${String(error)}\n`);
		});
		// 按本地日历安排下一次清理，兼容夏令时下非 24 小时的日期。
		const next = new Date();
		next.setHours(24, 0, 0, 0);
		this.cleanupTimer = setTimeout(() => {
			void this.cleanup.then(() => {
				if (!this.stopping) {
					this.startCleanup();
				}
			});
		}, next.getTime() - Date.now());
		this.cleanupTimer.unref();
	}

	private stopCleanup() {
		this.stopping = true;
		clearTimeout(this.cleanupTimer);
		this.cleanupTimer = undefined;
	}

	private async cleanupOldLogs() {
		const cutoff = new Date();
		cutoff.setHours(0, 0, 0, 0);
		cutoff.setDate(cutoff.getDate() - this.options.retentionDays);
		const cutoffDate = getDate(cutoff.getTime());
		// 过期且空闲的来源先排空并释放目录，避免常驻 writer 永久阻止清理。
		await Promise.all([...this.writers.values()].map((writer) => writer.releaseBefore(cutoffDate)));
		for (const component of await readDirectory(this.options.logDir)) {
			if (!component.isDirectory()) {
				continue;
			}
			const componentDir = path.join(this.options.logDir, component.name);
			for (const entry of await readDirectory(componentDir)) {
				if (this.destroyed) {
					return;
				}
				if (!entry.isDirectory() || !isDateName(entry.name) || entry.name >= cutoffDate) {
					continue;
				}
				const directory = path.join(componentDir, entry.name);
				if (this.directoryUsers.has(directory)) {
					continue;
				}
				const removal = rm(directory, { recursive: true, force: true });
				this.removals.set(directory, removal);
				try {
					await removal;
				} finally {
					this.removals.delete(directory);
				}
			}
		}
	}
}

interface WriterOptions extends FileOptions {
	component: string;
	source: string;
}

class LogFileWriter {
	private currentDate = '';
	private index = 0;
	private fileBytes = 0;
	private pending = '';
	private pendingBytes = 0;
	private stream: WriteStream | undefined;
	private timer: NodeJS.Timeout | undefined;
	private operation: Promise<void> = Promise.resolve();
	private closePromise: Promise<void> | undefined;
	private releaseDirectory: (() => void) | undefined;
	private failure: Error | undefined;
	private closing = false;

	constructor(
		private readonly options: WriterOptions,
		private readonly acquireDirectory: (directory: string) => Promise<() => void>,
		private readonly onError: (error: Error) => void,
	) {}

	private readonly fail = (error: Error) => {
		if (!this.failure) {
			this.failure = error;
			this.clearTimer();
			this.onError(error);
		}
	};

	private enqueue(task: () => Promise<void>) {
		this.operation = this.operation.then(async () => {
			if (this.failure) {
				throw this.failure;
			}
			await task();
		});
		// 定时器没有调用方等待，失败仍必须进入同一个 transport 错误出口。
		void this.operation.catch(this.fail);
		return this.operation;
	}

	appendBatch(date: string, data: string) {
		return this.enqueue(async () => {
			if (this.currentDate !== date) {
				await this.release();
				this.currentDate = date;
			}
			await this.ensureStream();
			await this.appendData(data, Buffer.byteLength(data));
			if (this.pendingBytes && !this.timer && !this.closing) {
				this.timer = setTimeout(() => {
					this.timer = undefined;
					void this.enqueue(() => this.flush());
				}, this.options.flushIntervalMs);
			}
		});
	}

	private async appendData(data: string, bytes: number) {
		if (bytes <= this.options.maxBytes) {
			await this.appendPart(data, bytes);
			return;
		}
		// 单条记录允许超过轮转阈值，避免拆开 JSON；大批次按行处理。
		for (const line of data.split('\n')) {
			if (line) {
				await this.appendPart(`${line}\n`, Buffer.byteLength(line) + 1);
			}
		}
	}

	private async appendPart(data: string, bytes: number) {
		const total = this.fileBytes + this.pendingBytes;
		if (total > 0 && total + bytes > this.options.maxBytes) {
			await this.flush();
			await this.closeStream();
			this.index += 1;
			this.fileBytes = 0;
			await this.ensureStream();
		}
		this.pending += data;
		this.pendingBytes += bytes;
		if (this.pendingBytes >= this.options.bufferBytes) {
			await this.flush();
		}
	}

	private clearTimer() {
		clearTimeout(this.timer);
		this.timer = undefined;
	}

	private async ensureStream() {
		if (this.failure) {
			throw this.failure;
		}
		if (this.stream) {
			return;
		}
		const directory = path.join(this.options.logDir, this.options.component, this.currentDate);
		this.releaseDirectory ||= await this.acquireDirectory(directory);
		await mkdir(directory, { recursive: true });
		if (!this.index) {
			const current = await findCurrentFile(directory, this.options.source, this.options.maxBytes);
			this.index = current.index;
			this.fileBytes = current.size;
		}
		if (this.failure) {
			throw this.failure;
		}
		this.stream = createWriteStream(path.join(directory, fileName(this.options.source, this.index)), {
			flags: 'a',
			encoding: 'utf8',
			highWaterMark: this.options.bufferBytes,
		});
		// 常驻监听覆盖 open、低流量 write 和 close 之间的所有错误窗口。
		this.stream.on('error', this.fail);
		await once(this.stream, 'open');
	}

	private async flush() {
		this.clearTimer();
		if (!this.pending) {
			return;
		}
		await this.ensureStream();
		// write 回调确认本批文件 I/O 成功，同时限制并发写入；不等同于 fsync。
		await writeData(this.stream!, this.pending);
		this.fileBytes += this.pendingBytes;
		this.pending = '';
		this.pendingBytes = 0;
	}

	private async closeStream() {
		const stream = this.stream;
		this.stream = undefined;
		if (stream && !stream.closed) {
			// 错误已由常驻监听记录；这里仍等 close，确保文件描述符实际释放。
			const closed = new Promise<void>((resolve) => stream.once('close', resolve));
			if (this.failure) {
				stream.destroy();
			} else {
				stream.end();
			}
			await closed;
		}
		stream?.off('error', this.fail);
	}

	private async release() {
		try {
			await this.flush();
		} finally {
			await this.closeStream();
			this.releaseDirectory?.();
			this.releaseDirectory = undefined;
			this.index = 0;
			this.fileBytes = 0;
		}
	}

	releaseBefore(date: string) {
		if (this.closing || !this.currentDate || this.currentDate >= date) {
			return Promise.resolve();
		}
		return this.enqueue(async () => {
			if (this.currentDate < date) {
				await this.release();
				this.currentDate = '';
			}
		});
	}

	abort(error: Error) {
		this.failure ||= error;
		this.clearTimer();
		this.stream?.destroy(error);
	}

	close() {
		if (!this.closePromise) {
			this.closing = true;
			this.clearTimer();
			this.closePromise = this.operation
				.then(() => this.flush())
				.finally(async () => {
					await this.closeStream();
					this.releaseDirectory?.();
					this.releaseDirectory = undefined;
					this.pending = '';
					this.pendingBytes = 0;
					if (this.failure) {
						throw this.failure;
					}
				});
		}
		return this.closePromise;
	}
}

async function writeData(stream: NodeJS.WritableStream, data: string) {
	await new Promise<void>((resolve, reject) => {
		stream.write(data, 'utf8', (error?: Error | null) => (error ? reject(error) : resolve()));
	});
}

async function readDirectory(directory: string) {
	try {
		return await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}
}

async function findCurrentFile(directory: string, source: string, maxBytes: number) {
	const prefix = `${source}.`;
	let highest = 0;
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith('.ndjson')) {
			continue;
		}
		const value = entry.name.slice(prefix.length, -'.ndjson'.length);
		const index = /^\d+$/.test(value) ? Number(value) : 0;
		if (Number.isSafeInteger(index) && index > highest && entry.name === fileName(source, index)) {
			highest = index;
		}
	}
	if (!highest) {
		return { index: 1, size: 0 };
	}
	let size = 0;
	try {
		size = (await stat(path.join(directory, fileName(source, highest)))).size;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
	return size >= maxBytes ? { index: highest + 1, size: 0 } : { index: highest, size };
}

function fileName(source: string, index: number) {
	return `${source}.${String(index).padStart(4, '0')}.ndjson`;
}

function getComponent(record: LogRecord, components: Set<string>) {
	return typeof record.component === 'string' && components.has(record.component) ? record.component : 'app';
}

function getSource(record: LogRecord, component: string, options: ResolvedOptions) {
	if (typeof record.source === 'string' && record.source) {
		const source = safeToken(record.source.startsWith('hls-') ? record.source.slice(4) : record.source);
		if (options.sources.has(source)) {
			return source;
		}
	}
	const event = typeof record.event === 'string' ? record.event : '';
	if (component === 'http') {
		const exactSource = options.httpEventSource.get(event);
		if (exactSource && options.sources.has(exactSource)) {
			return exactSource;
		}
		if (event.startsWith('http.request.')) {
			return 'error';
		}
		if (options.httpBusinessPrefixes.some((prefix) => event.startsWith(prefix))) {
			return 'business';
		}
	}
	return 'default';
}

function getDate(value: unknown) {
	let date = new Date(typeof value === 'number' ? value : Date.now());
	// 有限数字也可能超出 Date 范围；目录只使用四位年份的有效日期。
	if (!Number.isFinite(date.getTime()) || date.getFullYear() < 0 || date.getFullYear() > 9999) {
		date = new Date();
	}
	return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function safeToken(value: string) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9_-]/gu, '-')
			.slice(0, 48) || 'default'
	);
}

function isDateName(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && getDate(new Date(`${value}T00:00:00`).getTime()) === value;
}

function nonNegativeInteger(value: number, name: string) {
	if (Number.isSafeInteger(value) && value >= 0) {
		return value;
	}
	throw new Error(`Invalid transport option: ${name}`);
}

function positiveInteger(value: number, name: string) {
	if (value > 0) {
		return nonNegativeInteger(value, name);
	}
	throw new Error(`Invalid transport option: ${name}`);
}
