/// <reference types="koa" />

import type { Response } from '~types/response';

export {};

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
