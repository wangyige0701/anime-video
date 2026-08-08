import { randomUUID } from 'node:crypto';
import type { Context, Middleware } from 'koa';
import pino, { type Bindings, type Logger } from 'pino';
import { ServerRoot } from '~routes/server';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';
const transport = isProduction
	? undefined
	: pino.transport({
			target: 'pino-pretty',
			options: {
				colorize: true,
				ignore: 'pid,hostname',
				translateTime: 'SYS:standard',
			},
		});

export const logger = pino(
	{
		base: { service: 'anime-video' },
		level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
	},
	transport,
);

/** 为模块或后台任务创建带固定上下文的日志实例。 */
export function createLogger(bindings: Bindings = {}): Logger {
	return logger.child(bindings);
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
