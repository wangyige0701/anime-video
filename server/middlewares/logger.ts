import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Context, Middleware } from 'koa';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino, { type Bindings, type Logger, type TransportMultiOptions } from 'pino';
import { ServerRoot } from '~routes/server';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const logging = __APP_CONFIG__.logging;
const fileLoggingEnabled = logging.fileEnabled;
const logDir = resolve(process.cwd(), logging.directory);
const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const sourceTransport = resolve(moduleDir, '../dist/log-transport.js');
const compiledTransport = resolve(moduleDir, '../log-transport.js');
const logTransport = fileLoggingEnabled
	? existsSync(sourceTransport)
		? sourceTransport
		: existsSync(compiledTransport)
			? compiledTransport
			: undefined
	: undefined;

// 文件落盘开启时必须有编译产物，否则提前失败比运行中静默丢日志更安全。
if (fileLoggingEnabled && !logTransport) {
	throw new Error('日志落盘 transport 尚未编译，请先执行 pnpm build:log-transport');
}

// 控制台格式化和文件落盘都交给 worker，避免在请求线程执行文件 I/O。
const transportTargets: TransportMultiOptions['targets'] = [
	...(isProduction
		? [{ target: 'pino/file', options: { destination: 1 }, level: logLevel }]
		: [
				{
					target: 'pino-pretty',
					options: {
						colorize: true,
						ignore: 'pid,hostname',
						translateTime: 'SYS:standard',
					},
					level: logLevel,
				},
			]),
	...(logTransport
		? [
				{
					target: logTransport,
					options: {
						logDir,
						environment: process.env.NODE_ENV || 'development',
						maxBytes: logging.fileMaxBytes,
						retentionDays: logging.retentionDays,
						bufferBytes: logging.bufferBytes,
						flushIntervalMs: logging.flushIntervalMs,
						pid: process.pid,
					},
					level: logLevel,
				},
			]
		: []),
];

const transport = pino.transport({ targets: transportTargets });

export const logger = pino(
	{
		base: { service: 'anime-video' },
		level: logLevel,
	},
	transport,
);

/** 为模块或后台任务创建带固定上下文的日志实例。 */
export function createLogger(bindings: Bindings = {}): Logger {
	return logger.child(bindings);
}

let closePromise: Promise<void> | undefined;

export function closeLogger() {
	// 结束 transport 会等待 worker 内的批量缓冲和所有文件流完成写入。
	if (!closePromise) {
		closePromise = new Promise<void>((resolve, reject) => {
			(transport as { end: (callback: (error?: Error) => void) => void }).end((error) =>
				error ? reject(error) : resolve(),
			);
		});
	}
	return closePromise;
}

function getRoute(ctx: Pick<Context, 'path'>) {
	const matchedRoute = (ctx as { _matchedRoute?: string })._matchedRoute;
	if (matchedRoute) {
		return matchedRoute;
	}
	if (ctx.path.startsWith(`${ServerRoot.VIDEO}/`)) {
		return `${ServerRoot.VIDEO}/*`;
	}
	if (ctx.path.startsWith(`${ServerRoot.IMAGE}/`)) {
		return `${ServerRoot.IMAGE}/*`;
	}
	return ctx.path;
}

function getAccessLogLevel(ctx: Pick<Context, 'path'>): LogLevel {
	// 媒体分片和图片请求频率高，只在调试级别保留访问摘要。
	if (ctx.path.startsWith(`${ServerRoot.VIDEO}/`) || ctx.path.startsWith(`${ServerRoot.IMAGE}/`)) {
		return 'debug';
	}
	return 'info';
}

/** 为请求挂载独立日志实例，并在请求完成后记录摘要。 */
export function requestLog(): Middleware {
	return async (ctx, next) => {
		const startedAt = performance.now();
		const requestId = randomUUID();
		const log = createLogger({ component: 'http', requestId });

		ctx.log = log;
		ctx.set('x-request-id', requestId);

		try {
			await next();
		} finally {
			const durationMs = Math.round(performance.now() - startedAt);
			// 异常详情和 5xx 堆栈由 error 中间件单独记录，避免访问日志重复报错。
			const level = getAccessLogLevel(ctx);
			log[level](
				{
					event: 'http.request.completed',
					method: ctx.method,
					route: getRoute(ctx),
					status: ctx.status,
					durationMs,
				},
				'HTTP request completed',
			);
		}
	};
}
