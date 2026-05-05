import type { Middleware } from 'koa';
import { BaseError } from '@server/src/error/error';

export function error(): Middleware {
	return async (ctx, next) => {
		try {
			await next();
		} catch (error) {
			if (error instanceof BaseError) {
				ctx.status = error.getCode();
				ctx.body = error.getBody();
				return;
			}
		}
	};
}
