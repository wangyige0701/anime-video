import { CSRF_META_NAME } from '~shared/csrf';

/**
 * 从页面里读取 CSRF 令牌。
 *
 * 令牌随 `index.html` 下发（静态页服务与 Vite 开发服务都会注入 `<meta name="csrf-token">`），
 * 因此这里不需要请求任何接口：少一次往返，也少一个「谁都能来取」的入口。
 *
 * 页面上没有令牌说明页面不是由本应用的服务下发的（例如把构建产物丢到别的静态服务器上），
 * 这时写操作会被服务端拒绝，只告警一次避免刷屏。
 */

let warned = false;

/** 读取页面里的令牌；缺失时返回空串，由服务端给出「令牌无效」的原因 */
export function getCsrfToken() {
	const token = document.querySelector<HTMLMetaElement>(`meta[name="${CSRF_META_NAME}"]`)?.content ?? '';
	if (!token && !warned) {
		warned = true;
		console.warn(
			'[csrf] 页面未注入 CSRF 令牌，写操作会被服务端拒绝；请用本项目的 web 服务或 Vite 开发服务打开页面',
		);
	}
	return token;
}

/**
 * 是否是不需要令牌的安全方法。
 *
 * 与 HTTP 语义一致：只读请求不改状态，服务端也不校验。
 */
export function isSafeMethod(method?: string) {
	const target = (method ?? 'get').toLowerCase();
	return target === 'get' || target === 'head' || target === 'options';
}
