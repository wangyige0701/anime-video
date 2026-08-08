import type { Middleware } from 'koa';
import { ApiError } from '~server/src/error';
import { createLogger } from './logger';

export function error(): Middleware {
	return async (ctx, next) => {
		try {
			await next();
		} catch (caught) {
			if (caught instanceof ApiError) {
				ctx.status = caught.getCode();
				ctx.type = caught.getContentType();
				ctx.body = caught.getBody();
				return;
			}

			const error = caught instanceof Error ? caught : new Error(String(caught));
			const log = ctx.log || createLogger({ component: 'http' });
			log.error({ err: error }, 'Unhandled request error');
			ctx.status = 500;
			ctx.type = 'text/plain';
			ctx.body = 'Internal Server Error';
		}
	};
}
