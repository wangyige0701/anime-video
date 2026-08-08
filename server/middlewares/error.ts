import type { Middleware } from 'koa';
import { ApiError } from '~server/src/error';
import { createLogger } from './logger';

export function error(): Middleware {
	return async (ctx, next) => {
		try {
			await next();
		} catch (caught) {
			const log = ctx.log || createLogger({ component: 'http' });
			if (caught instanceof ApiError) {
				// 业务 4xx 是预期客户端错误，无需输出堆栈；显式 5xx 仍应记录。
				const status = caught.getCode();
				if (status >= 500) {
					log.error({ event: 'http.request.failed', err: caught, status }, 'Request failed');
				} else if (status !== 404) {
					// 400、401、403 等客户端异常保留原因，便于排查前端调用和潜在的异常访问。
					log.warn(
						{
							event: 'http.request.rejected',
							status,
							error: {
								name: caught.name,
								message: caught.message,
							},
							responseMessage: getResponseMessage(caught),
						},
						'Request rejected',
					);
				}
				ctx.status = status;
				ctx.type = caught.getContentType();
				ctx.body = caught.getBody();
				return;
			}

			const error = caught instanceof Error ? caught : new Error(String(caught));
			log.error({ event: 'http.request.failed', err: error }, 'Unhandled request error');
			ctx.status = 500;
			ctx.type = 'text/plain';
			ctx.body = 'Internal Server Error';
		}
	};
}

function getResponseMessage(error: ApiError) {
	const body = error.getBody();
	if (typeof body === 'object' && body !== null && 'message' in body) {
		return String(body.message);
	}
	return error.message;
}
