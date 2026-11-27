/**
 * 最小 HTTP JSON 客户端：可选代理、超时、429/5xx 退避重试。
 *
 * 为什么不用全局 `fetch`：内置 fetch 不支持按请求指定代理，Node 20 的 undici
 * 需要额外构造 Dispatcher 并处理连接池生命周期。这里只有「GET/POST 一个 JSON」的需求，
 * 直接用 http/https 加几十行 CONNECT 隧道，既零依赖也不会影响进程内其它 HTTP 使用。
 *
 * 隧道只用于 https；http 目标直接连，因为明文代理本来就可以用绝对 URL 转发，
 * 而 Bangumi 与 OpenAI 兼容接口都是 https，实际只有隧道这一条路径会被走到。
 */
import http from 'node:http';
import https from 'node:https';

export interface JsonRequestOptions {
	method?: 'GET' | 'POST';
	body?: unknown;
	headers?: Record<string, string>;
	timeout?: number;
	/** http://host:port 形式的代理地址；空串表示直连 */
	proxy?: string;
}

export interface JsonResponse<T> {
	status: number;
	headers: http.IncomingHttpHeaders;
	raw: string;
	data: T | undefined;
}

function openTunnel(proxy: string, target: URL) {
	const proxyUrl = new URL(proxy);
	return new Promise<import('node:net').Socket>((resolve, reject) => {
		const request = http.request({
			host: proxyUrl.hostname,
			port: proxyUrl.port || 80,
			method: 'CONNECT',
			path: `${target.hostname}:${target.port || 443}`,
			headers: { Host: `${target.hostname}:${target.port || 443}` },
			// 代理本身通常不走二次代理，也不需要长连接复用
			agent: false,
		});
		request.once('connect', (response, socket) => {
			if (response.statusCode !== 200) {
				socket.destroy();
				reject(new Error(`代理 CONNECT 失败：${response.statusCode}`));
				return;
			}
			resolve(socket);
		});
		request.once('error', reject);
		request.end();
	});
}

/**
 * 发起一次 JSON 请求。
 *
 * 不在此层判断业务状态码：调用方需要区分 404（资源不存在）、429（限流）与网络失败，
 * 统一抛错会丢掉这些信息。超时与连接错误仍然直接 reject，因为重试由 `requestJsonWithRetry` 负责。
 */
export async function requestJson<T>(url: string, options: JsonRequestOptions = {}): Promise<JsonResponse<T>> {
	const target = new URL(url);
	const isHttps = target.protocol === 'https:';
	const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
	const headers: Record<string, string | number> = {
		Host: target.hostname,
		Accept: 'application/json',
		...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
		...options.headers,
	};
	const timeout = options.timeout ?? 15000;
	const socket = options.proxy && isHttps ? await openTunnel(options.proxy, target) : undefined;

	return await new Promise<JsonResponse<T>>((resolve, reject) => {
		const transport = isHttps ? https : http;
		const request = transport.request(
			{
				host: target.hostname,
				port: target.port || (isHttps ? 443 : 80),
				path: `${target.pathname}${target.search}`,
				method: options.method ?? 'GET',
				headers,
				timeout,
				agent: false,
				...(socket ? { socket, servername: target.hostname } : {}),
			},
			(response) => {
				let raw = '';
				response.setEncoding('utf8');
				response.on('data', (chunk) => {
					raw += chunk;
				});
				response.on('end', () => {
					let data: T | undefined;
					try {
						data = raw ? (JSON.parse(raw) as T) : undefined;
					} catch {
						data = undefined;
					}
					resolve({ status: response.statusCode ?? 0, headers: response.headers, raw, data });
				});
			},
		);
		request.on('timeout', () => {
			request.destroy(new Error(`请求超时（${timeout}ms）`));
		});
		request.on('error', reject);
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

/** 仅对这些状态重试：限流与服务端抖动是可恢复的，4xx 重试没有意义 */
function isRetryable(status: number) {
	return status === 429 || (status >= 500 && status < 600);
}

/**
 * 带退避的 JSON 请求。
 *
 * 优先使用 `Retry-After`，其次按次数线性退避。Bangumi 对高频请求会返回 429，
 * 一次同步最多触发几次重试，这里把上限设为 3 次，避免接口长时间挂起。
 */
export async function requestJsonWithRetry<T>(
	url: string,
	options: JsonRequestOptions = {},
	attempt = 0,
): Promise<JsonResponse<T>> {
	const response = await requestJson<T>(url, options);
	if (!isRetryable(response.status) || attempt >= 3) {
		return response;
	}
	const retryAfter = Number(response.headers['retry-after']);
	const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * (attempt + 1);
	await new Promise((resolve) => setTimeout(resolve, delay));
	return await requestJsonWithRetry<T>(url, options, attempt + 1);
}
