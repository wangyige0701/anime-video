import type { Middleware } from 'koa';
import { Status } from '~common/status';

function responseStruct(data: any, code: number, success: boolean, message: string) {
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
			ctx.status = Status.Success;
			return responseStruct(data, Status.Success, true, message);
		};

		ctx.Ok = ctx.Success;

		ctx.Failed = (data: any = null, message: string = 'Bad Request') => {
			ctx.status = Status.Failed;
			return responseStruct(data, Status.Failed, false, message);
		};

		ctx.BadRequest = ctx.Failed;

		ctx.NotFound = (data: any = null, message: string = 'Not Found') => {
			ctx.status = Status.NotFound;
			return responseStruct(data, Status.NotFound, false, message);
		};

		ctx.InternalServerError = (data: any = null, message: string = 'Internal Server Error') => {
			ctx.status = Status.InternalServerError;
			return responseStruct(data, Status.InternalServerError, false, message);
		};

		await next();
	};
}
