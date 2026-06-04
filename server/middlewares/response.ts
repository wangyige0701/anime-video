import type { Middleware } from 'koa';
import type { Response as ResponseImpl } from '~types/response';
import { Status } from '~common/status';
import Statuses from 'statuses';

class Response<T extends any> implements ResponseImpl<T> {
	public timestamp!: number;

	constructor(
		public data: any,
		public code: number,
		public success: boolean,
		public message: string,
	) {
		if (data instanceof Response) {
			return new Response(data.data, code, success, message);
		}
		this.timestamp = Date.now();
	}

	public toJSON() {
		return {
			code: this.code,
			data: this.data,
			success: this.success,
			message: this.message,
			timestamp: this.timestamp,
		};
	}
}

function responseStruct(data: any, code: number, success: boolean, message: string) {
	return new Response(data, code, success, message);
}

export function response(): Middleware {
	return async (ctx, next) => {
		ctx.Success = (data: any = null, message = Statuses.message[Status.Success]!) => {
			ctx.status = Status.Success;
			return responseStruct(data, Status.Success, true, message);
		};

		ctx.Ok = ctx.Success;

		ctx.Failed = (data: any = null, message = Statuses.message[Status.Failed]!) => {
			ctx.status = Status.Failed;
			return responseStruct(data, Status.Failed, false, message);
		};

		ctx.BadRequest = ctx.Failed;

		ctx.Unauthorized = (data: any = null, message = Statuses.message[Status.Unauthorized]!) => {
			ctx.status = Status.Unauthorized;
			return responseStruct(data, Status.Unauthorized, false, message);
		};

		ctx.Forbidden = (data: any = null, message = Statuses.message[Status.Forbidden]!) => {
			ctx.status = Status.Forbidden;
			return responseStruct(data, Status.Forbidden, false, message);
		};

		ctx.NotFound = (data: any = null, message = Statuses.message[Status.NotFound]!) => {
			ctx.status = Status.NotFound;
			return responseStruct(data, Status.NotFound, false, message);
		};

		ctx.InternalServerError = (data: any = null, message = Statuses.message[Status.InternalServerError]!) => {
			ctx.status = Status.InternalServerError;
			return responseStruct(data, Status.InternalServerError, false, message);
		};

		ctx.BadGateway = (data: any = null, message = Statuses.message[Status.BadGateway]!) => {
			ctx.status = Status.BadGateway;
			return responseStruct(data, Status.BadGateway, false, message);
		};

		await next();
	};
}
