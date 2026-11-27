/**
 * 从请求错误里取出服务端给出的可读消息。
 *
 * `ApiError` 以「原始状态码 + text/plain 响应体」返回（见 `server/middlewares/error.ts`），
 * 此时 axios 的 `error.message` 只有 "Request failed with status code 400"，
 * 真正的原因在响应体里。JSON 响应体不在这里处理：参数校验失败会带一大段结构，
 * 直接弹给用户只是一屏乱码。
 *
 * 只接受 text/plain：避免把 HTML 错误页或二进制内容当成提示消息。
 */
export function getPlainErrorMessage(error: unknown) {
	const response = (error as { response?: { data?: unknown; headers?: Record<string, unknown> } } | null)?.response;
	if (!response || typeof response.data !== 'string') {
		return '';
	}
	const contentType = response.headers?.['content-type'];
	if (typeof contentType !== 'string' || !contentType.includes('text/plain')) {
		return '';
	}
	return response.data.trim();
}
