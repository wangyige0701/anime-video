export interface Response<T = any> {
	code: number;
	data: ResponseData<T>;
	success: boolean;
	message: string;
	timestamp: number;
}

/**
 * 响应体 data 的实际类型。
 *
 * `server/middlewares/response.ts` 的 `Response` 构造函数在收到另一个 `Response` 实例时，
 * 会取出其 `data` 重新包装（`if (data instanceof Response) return new Response(data.data, ...)`），
 * 因此 `ctx.Success(ctx.Success(dto))` 在运行时只剥一层。这个条件类型与那段逻辑一一对应：
 * 传入 `Response<U>` 得到 `U`，传入普通 DTO 则保持原类型。
 */
export type ResponseData<T> = T extends Response<infer U> ? U : T;
