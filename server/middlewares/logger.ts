import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Context, Middleware } from 'koa';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino, { type Bindings, type Logger } from 'pino';
import { ServerRoot } from '~routes/server';
import { LogDestination } from '~server/src/log-destination';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const LOGGING = __APP_CONFIG__.logging;
const logDir = resolve(process.cwd(), LOGGING.directory);
const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const sourceTransport = resolve(moduleDir, '../dist/log-transport.js');
const compiledTransport = resolve(moduleDir, '../log-transport.js');
const logTransport = [sourceTransport, compiledTransport].find((candidate) => existsSync(candidate));

// 控制台和文件统一走同一个 worker，启动前必须有编译产物。
if (!logTransport) {
	throw new Error('日志落盘 transport 尚未编译，请先执行 pnpm build:log-transport');
}

const transport = pino.transport({
	target: logTransport,
	// 由 closeLogger/beforeExit 异步排空，关闭 Pino 默认的同步退出处理。
	worker: { autoEnd: false },
	options: {
		logDir,
		fileEnabled: LOGGING.fileEnabled,
		consoleFormat: isProduction ? 'json' : 'pretty',
		maxBytes: LOGGING.fileMaxBytes,
		retentionDays: LOGGING.retentionDays,
		bufferBytes: LOGGING.bufferBytes,
		flushIntervalMs: LOGGING.flushIntervalMs,
		components: LOGGING.components,
		sources: LOGGING.sources,
		httpEventSource: LOGGING.httpEventSource,
		httpBusinessPrefixes: LOGGING.httpBusinessPrefixes,
	},
});
const destination = new LogDestination(transport, LOGGING.maxQueueBytes);

export const logger = pino(
	{
		base: { service: 'anime-video' },
		level: logLevel,
	},
	destination,
);

/**
 * 为模块或后台任务创建带固定上下文的日志实例。
 */
export function createLogger(bindings: Bindings = {}): Logger {
	return logger.child(bindings);
}

export function closeLogger() {
	return destination.close();
}

process.once('beforeExit', () => {
	void closeLogger().catch((error: unknown) => {
		process.stderr.write(`[logger] Failed to close logs: ${String(error)}\n`);
		process.exitCode = 1;
	});
});

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

/**
 * 为请求挂载独立日志实例，并在请求完成后记录摘要。
 */
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
			// 异常详情和 5xx 堆栈由 error 中间件单独记录，避免访问日志重复报错。
			const level = getAccessLogLevel(ctx);
			if (log.isLevelEnabled(level)) {
				log[level](
					{
						event: 'http.request.completed',
						method: ctx.method,
						route: getRoute(ctx),
						status: ctx.status,
						durationMs: Math.round(performance.now() - startedAt),
					},
					'HTTP request completed',
				);
			}
		}
	};
}
