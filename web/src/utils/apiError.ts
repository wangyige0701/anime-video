/**
 * 把请求错误翻译成可以直接展示给用户的文案。
 *
 * 三层来源，优先级从高到低：
 * 1. `ApiError` 的 text/plain 响应体（业务原因，最准确）；
 * 2. 网络层错误码（连接失败、超时），这类错误没有响应体，`error.message` 是
 *    axios 的英文原文（"Network Error" / "timeout of 0ms exceeded"），直接弹给用户没有意义；
 * 3. HTTP 状态码兜底，避免把 "Request failed with status code 500" 这种英文露出去。
 *
 * 主动取消（`ERR_CANCELED`）返回空串：调用方据此跳过提示，不算失败。
 */

/** 从 text/plain 响应体里取服务端给出的可读消息 */
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

/** 读取 axios 的错误码；非 axios 错误返回空串 */
function getErrorCode(error: unknown) {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' ? code : '';
}

/** 读取 HTTP 状态码；请求没有拿到响应时返回 0 */
function getHttpStatus(error: unknown) {
	const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
	return typeof status === 'number' ? status : 0;
}

/**
 * 网络层错误的中文文案。
 *
 * `ERR_NETWORK` 在浏览器里就是「请求没拿到任何响应」：服务端进程没起来、
 * 预览期间刚好被 `tsx watch` 重启、或者地址不可达。提示要能指向下一步动作，
 * 而不是把 axios 的 "Network Error" 原样抛给用户。
 */
function getNetworkErrorMessage(error: unknown) {
	const code = getErrorCode(error);
	if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
		return '请求超时，服务端处理时间过长，请稍后重试';
	}
	if (code === 'ERR_NETWORK' || code === 'ERR_CONNECTION_REFUSED' || code === 'ERR_CONNECTION_RESET') {
		return '无法连接服务端，请确认服务端已启动后重试';
	}
	return '';
}

/** 把请求错误翻译成提示文案；返回空串表示不需要提示 */
export function getApiErrorMessage(error: unknown): string {
	if (getErrorCode(error) === 'ERR_CANCELED') {
		return '';
	}
	const plain = getPlainErrorMessage(error);
	if (plain) {
		return plain;
	}
	const network = getNetworkErrorMessage(error);
	if (network) {
		return network;
	}
	const status = getHttpStatus(error);
	if (status > 0) {
		// 服务端兜底 500 的响应体是 "Internal Server Error"，对用户没有信息量
		return `请求失败（HTTP ${status}），请稍后重试`;
	}
	return '请求失败，请检查网络后重试';
}
