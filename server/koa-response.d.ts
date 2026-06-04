/// <reference types="koa" />

import type { Response } from '~types/response';

export {};

type KoaResponse = <T extends any>(data?: T, message?: string) => Response<T>;

declare module 'koa' {
	interface Context {
		Success: KoaResponse;
		Ok: KoaResponse;
		Failed: KoaResponse;
		BadRequest: KoaResponse;
		Unauthorized: KoaResponse;
		Forbidden: KoaResponse;
		NotFound: KoaResponse;
		InternalServerError: KoaResponse;
		BadGateway: KoaResponse;
	}
}
