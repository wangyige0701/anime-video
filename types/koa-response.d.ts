import 'koa';

export interface Response<T = any> {
	code: number;
	data: T;
	success: boolean;
	message: string;
	timestamp: number;
}

type KoaResponse = (data?: any, message?: string) => Response;

declare module 'koa' {
	interface Context {
		Success: KoaResponse;
		Ok: KoaResponse;
		Failed: KoaResponse;
		BadRequest: KoaResponse;
		NotFound: KoaResponse;
		InternalServerError: KoaResponse;
	}
}
