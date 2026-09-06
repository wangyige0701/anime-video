import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { Writable } from 'node:stream';

const COMPONENTS = new Set(['app', 'http', 'web', 'hls']);
const SOURCES = new Set([
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
]);
const HTTP_EVENT_SOURCE = new Map([
	['http.request.completed', 'access'],
	['http.request.failed', 'error'],
	['http.request.rejected', 'error'],
]);
const HTTP_BUSINESS_PREFIXES = ['series.', 'season.', 'episode.', 'directories.', 'system.'];

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_BUFFER_BYTES = 64 * 1024;
const DEFAULT_FLUSH_INTERVAL_MS = 100;

interface TransportOptions {
	logDir?: string;
	environment?: string;
	maxBytes?: number;
	retentionDays?: number;
	bufferBytes?: number;
	flushIntervalMs?: number;
	pid?: number;
}

interface ResolvedOptions {
	logDir: string;
	environment: string;
	maxBytes: number;
	retentionDays: number;
	bufferBytes: number;
	flushIntervalMs: number;
	pid: number;
}

interface LogRecord {
	component?: unknown;
	source?: unknown;
	event?: unknown;
	time?: unknown;
}

export default function createLogTransport(options: TransportOptions = {}) {
	return new LogTransport(options);
}

/** Pino worker 中的写入入口，负责将 NDJSON 记录路由到独立文件 writer。 */
class LogTransport extends Writable {
	private readonly options: ResolvedOptions;
	private readonly writers = new Map<string, LogFileWriter>();
	private pending = '';
	private ready: Promise<void>;

	/** 规范化 transport 参数，并在后台启动过期日志清理。 */
	constructor(options: TransportOptions) {
		super();
		this.options = {
			logDir: options.logDir || path.resolve(process.cwd(), 'logs'),
			environment: safeToken(options.environment || 'development'),
			maxBytes: positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES),
			retentionDays: positiveInteger(options.retentionDays, 30),
			bufferBytes: positiveInteger(options.bufferBytes, DEFAULT_BUFFER_BYTES),
			flushIntervalMs: positiveInteger(options.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS),
			pid: positiveInteger(options.pid, process.pid),
		};
		// 清理在 transport worker 中执行，不占用 API 请求线程；失败不会阻断新日志写入。
		this.ready = cleanupOldLogs(this.options);
	}

	/** 接收 Pino 推送的日志块，通过 Promise 链保证块处理顺序稳定。 */
	_write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
		// 通过 ready 链串行处理 worker 收到的 chunk，避免多个 chunk 同时修改尾部缓存。
		this.ready = this.ready
			.then(() => this.processChunk(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)))
			.then(() => callback(), callback);
	}

	/** 结束 transport，补写尾部记录并等待所有文件 writer 完成关闭。 */
	_final(callback: (error?: Error | null) => void) {
		// Pino 通常以换行结束记录，但关闭时仍要补写最后一条没有换行符的记录。
		this.ready = this.ready
			.then(async () => {
				if (this.pending) {
					const line = `${this.pending}\n`;
					this.pending = '';
					await this.writeLine(line);
				}
				await Promise.all([...this.writers.values()].map((writer) => writer.close()));
			})
			.then(() => callback(), callback);
	}

	/** 拆分日志块中的完整行，未完成的最后一段保留到下一块继续拼接。 */
	private async processChunk(chunk: string) {
		this.pending += chunk;
		const lines = this.pending.split('\n');
		// 保留最后一个未完成的片段，下一次 chunk 到达后再和它拼接。
		this.pending = lines.pop() || '';
		for (const line of lines) {
			if (line) await this.writeLine(`${line}\n`);
		}
	}

	/** 解析单条日志，计算目标 component/source，并交给对应 writer 批量写入。 */
	private async writeLine(line: string) {
		let record: LogRecord;
		try {
			record = JSON.parse(line) as LogRecord;
		} catch {
			record = { component: 'app', source: 'transport', time: Date.now() };
		}

		// 路由只使用受控字段；无法解析或不在白名单的值会落入安全的默认分类。
		const component = getComponent(record);
		const source = getSource(record, component);
		const key = `${component}\0${source}`;
		let writer = this.writers.get(key);
		if (!writer) {
			writer = new LogFileWriter({ ...this.options, component, source });
			this.writers.set(key, writer);
		}
		await writer.append(getDate(record.time), line);
	}
}

interface WriterOptions extends ResolvedOptions {
	component: string;
	source: string;
}

/** 管理一个 component/source 的日期目录、缓冲区、文件流和轮转状态。 */
class LogFileWriter {
	private readonly options: WriterOptions;
	private currentDate = '';
	private index = 0;
	private fileBytes = 0;
	private pending = '';
	private pendingBytes = 0;
	private stream: WriteStream | null = null;
	private timer: NodeJS.Timeout | null = null;
	private operation: Promise<void> = Promise.resolve();

	/** 创建尚未打开文件流的 writer，实际目录在首条日志写入时建立。 */
	constructor(options: WriterOptions) {
		this.options = options;
	}

	/** 将日志加入串行写入队列，并按日期、大小和缓冲阈值安排刷盘。 */
	append(date: string, line: string) {
		// 同一个来源的写入串行化，保证轮转和日期切换不会交叉覆盖文件。
		this.operation = this.operation.then(async () => {
			if (this.currentDate !== date) {
				await this.flush();
				await this.closeStream();
				this.currentDate = date;
				this.index = 0;
				this.fileBytes = 0;
			}
			await this.ensureStream();
			const bytes = Buffer.byteLength(line, 'utf8');
			if (
				this.fileBytes + this.pendingBytes + bytes > this.options.maxBytes &&
				this.fileBytes + this.pendingBytes > 0
			) {
				await this.flush();
				await this.rotate();
			}
			this.pending += line;
			this.pendingBytes += bytes;
			if (this.pendingBytes >= this.options.bufferBytes) await this.flush();
			else this.scheduleFlush();
		});
		return this.operation;
	}

	/** 为低流量日志安排延迟刷盘，避免每条记录都触发一次文件写入。 */
	private scheduleFlush() {
		if (!this.timer) {
			// 低流量时由定时器兜底，避免小批量日志长期停留在内存中。
			this.timer = setTimeout(() => {
				this.timer = null;
				this.operation = this.operation.then(() => this.flush());
				void this.operation.catch(() => {});
			}, this.options.flushIntervalMs);
		}
	}

	/** 创建当前日期目录和追加模式文件流，并恢复已有文件的序号与大小。 */
	private async ensureStream() {
		if (this.stream) return;
		const directory = path.join(
			this.options.logDir,
			this.options.environment,
			this.options.component,
			this.currentDate,
		);
		await mkdir(directory, { recursive: true });
		// 每个日期首次打开时扫描已有文件，重启后接续未满的最高序号文件。
		if (!this.index) {
			this.index = await findNextIndex(
				directory,
				this.options.component,
				this.options.source,
				this.options.pid,
				this.options.maxBytes,
			);
		}
		const filePath = path.join(directory, fileName(this.options, this.index));
		try {
			this.fileBytes = (await stat(filePath)).size;
		} catch {
			this.fileBytes = 0;
		}
		this.stream = createWriteStream(filePath, {
			flags: 'a',
			encoding: 'utf8',
			highWaterMark: this.options.bufferBytes,
		});
		await once(this.stream, 'open');
	}

	/** 将内存批次写入文件流，处理 Node.js stream 背压并更新文件字节计数。 */
	private async flush() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (!this.pending) return;
		const data = this.pending;
		const bytes = this.pendingBytes;
		this.pending = '';
		this.pendingBytes = 0;
		await this.ensureStream();
		// write 返回 false 时等待 drain，避免高峰期无界堆积导致 worker 内存增长。
		if (!this.stream!.write(data, 'utf8')) await once(this.stream!, 'drain');
		this.fileBytes += bytes;
	}

	/** 关闭当前文件并递增序号，准备写入同一日期下的下一个轮转文件。 */
	private async rotate() {
		// 轮转只在当前批次已经刷盘后执行，保证单文件不会因异步写入顺序而超出预期。
		await this.closeStream();
		this.index += 1;
		this.fileBytes = 0;
		await this.ensureStream();
	}

	/** 关闭当前文件流并等待 close 事件，确保底层写入已完成。 */
	private async closeStream() {
		if (!this.stream) return;
		const stream = this.stream;
		this.stream = null;
		stream.end();
		await once(stream, 'close');
	}

	/** 停止定时器，等待排队操作和尾部批次完成后释放文件资源。 */
	async close() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		// 先等待已排队的 append，再刷最后一批，确保关闭时不丢日志。
		await this.operation;
		await this.flush();
		await this.closeStream();
	}
}

async function findNextIndex(directory: string, component: string, source: string, pid: number, maxBytes: number) {
	const prefix = `${component}.${source}.${pid}.`;
	let highest = 0;
	// 只扫描当前进程、当前来源的文件，避免多进程部署互相覆盖序号。
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith('.ndjson')) continue;
		const value = entry.name.slice(prefix.length, -'.ndjson'.length);
		const index = isDecimal(value) ? Number(value) : 0;
		if (Number.isInteger(index) && index > highest) highest = index;
	}
	if (!highest) return 1;
	const currentPath = path.join(
		directory,
		`${component}.${source}.${pid}.${String(highest).padStart(4, '0')}.ndjson`,
	);
	try {
		return (await stat(currentPath)).size >= maxBytes ? highest + 1 : highest;
	} catch {
		return highest;
	}
}

function fileName(options: WriterOptions, index: number) {
	return `${options.component}.${options.source}.${options.pid}.${String(index).padStart(4, '0')}.ndjson`;
}

function getComponent(record: LogRecord) {
	return typeof record.component === 'string' && COMPONENTS.has(record.component) ? record.component : 'app';
}

function getSource(record: LogRecord, component: string) {
	// 显式 source 优先；HTTP 未显式指定时再根据稳定 event 前缀归类业务日志。
	if (typeof record.source === 'string' && record.source) {
		const source = safeToken(record.source.startsWith('hls-') ? record.source.slice(4) : record.source);
		if (SOURCES.has(source)) return source;
	}
	const event = typeof record.event === 'string' ? record.event : '';
	if (component === 'http') {
		const exactSource = HTTP_EVENT_SOURCE.get(event);
		if (exactSource) return exactSource;
		if (event.startsWith('http.request.')) return 'error';
		if (HTTP_BUSINESS_PREFIXES.some((prefix) => event.startsWith(prefix))) return 'business';
	}
	return 'default';
}

function getDate(value: unknown) {
	// 日志时间异常时使用当前时间，避免创建非法日期目录阻断落盘。
	const timestamp = typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function cleanupOldLogs(options: ResolvedOptions) {
	if (!options.retentionDays) return;
	const root = path.join(options.logDir, options.environment);
	const cutoff = new Date();
	cutoff.setHours(0, 0, 0, 0);
	cutoff.setDate(cutoff.getDate() - options.retentionDays);
	let components;
	try {
		components = await readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const component of components) {
		if (!component.isDirectory()) continue;
		const componentDir = path.join(root, component.name);
		let dates;
		try {
			dates = await readdir(componentDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const dateEntry of dates) {
			if (!dateEntry.isDirectory() || !isDateName(dateEntry.name)) continue;
			if (new Date(`${dateEntry.name}T00:00:00`) < cutoff) {
				try {
					await rm(path.join(componentDir, dateEntry.name), { recursive: true, force: true });
				} catch {
					// 清理失败不应影响新日志写入。
				}
			}
		}
	}
}

function safeToken(value: string) {
	// 文件名只能包含有限字符，逐字符替换可避免路径分隔符和控制字符穿透目录边界。
	let result = '';
	for (const character of value.toLowerCase()) {
		const code = character.charCodeAt(0);
		const allowed =
			(code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a) || character === '-' || character === '_';
		result += allowed ? character : '-';
	}
	return result.slice(0, 48) || 'default';
}

function isDecimal(value: string) {
	if (!value) return false;
	for (const character of value) {
		if (character < '0' || character > '9') return false;
	}
	return true;
}

function isDateName(value: string) {
	const parts = value.split('-');
	return (
		parts.length === 3 &&
		parts[0]!.length === 4 &&
		parts[1]!.length === 2 &&
		parts[2]!.length === 2 &&
		parts.every((part) => isDecimal(part))
	);
}

function positiveInteger(value: number | undefined, fallback: number) {
	return Number.isInteger(value) && value! > 0 ? value! : fallback;
}
