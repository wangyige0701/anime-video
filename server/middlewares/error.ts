import type { Middleware } from 'koa';
import { ApiError } from '~server/src/error';

export function error(): Middleware {
	return async (ctx, next) => {
		try {
			await next();
		} catch (error) {
			if (error instanceof ApiError) {
				ctx.status = error.getCode();
				ctx.body = error.getBody();
				return;
			}
		}
	};
}
