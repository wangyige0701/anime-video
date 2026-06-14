import { createMiddlewareDecorator } from 'koa-use-decorator-router';
import z from 'zod';
import { Status } from '~common/status';
import { Response } from '~server/middlewares/response';
import { ApiError } from '~server/src/error';

/**
 * 验证请求体是否符合指定的 Zod 模式
 */
export function Validate(getSchema: (zod: typeof z) => z.ZodSchema) {
	const schema = getSchema(z);
	return createMiddlewareDecorator(async (ctx, next) => {
		const body = ctx.request.body;
		const result = schema.safeParse(body);
		if (!result.success) {
			throw new ApiError(Status.Failed, new Response(null, Status.Failed, false, result.error.message));
		}

		ctx.request.body = result.data as any;

		await next();
	})();
}
