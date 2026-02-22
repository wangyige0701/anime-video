import 'koa';

type KoaResponse = (data?: any, message?: string) => void;

declare module 'koa' {
	interface ContextDelegatedResponse {
		Success: KoaResponse;
		Ok: KoaResponse;
		Failed: KoaResponse;
		BadRequest: KoaResponse;
		NotFound: KoaResponse;
		InternalServerError: KoaResponse;
	}
}
