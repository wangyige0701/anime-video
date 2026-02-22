import type { Middleware } from 'koa';

function responseStruct(
	data: any,
	code: number,
	success: boolean,
	message: string,
) {
	return {
		code,
		data,
		success,
		message,
		timestamp: Date.now(),
	};
}

export function response(): Middleware {
	return async (ctx, next) => {
		ctx.Success = (data: any = null, message = 'success') => {
			ctx.status = 200;
			ctx.body = responseStruct(data, 200, true, message);
		};

		ctx.Ok = ctx.Success;

		ctx.Failed = (data: any = null, message: string = 'Bad Request') => {
			ctx.status = 400;
			ctx.body = responseStruct(data, 400, false, message);
		};

		ctx.BadRequest = ctx.Failed;

		ctx.NotFound = (data: any = null, message: string = 'Not Found') => {
			ctx.status = 404;
			ctx.body = responseStruct(data, 404, false, message);
		};

		ctx.InternalServerError = (
			data: any = null,
			message: string = 'Internal Server Error',
		) => {
			ctx.status = 500;
			ctx.body = responseStruct(data, 500, false, message);
		};

		await next();
	};
}
