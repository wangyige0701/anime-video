import type { Context, Middleware } from 'koa';
import { isUndefined } from '@wang-yige/utils';
import { Status } from '~shared/http-status';
import { CSRF_HEADER } from '~shared/csrf';
import { readCsrfSecret, verifyCsrfToken } from '~shared/csrf-secret';
import { ApiError } from '~server/src/error';
import { getDataDirectory } from '~server/src/utils/user-data-dir';

/**
 * CSRF 防护。
 *
 * 为什么不用现成插件：`koa-csrf`（koajs 官方仓库）已停止维护、被 npm 标记为 deprecated，
 * 且令牌存在 session 里、从 body 的 `_csrf` 读取——本项目没有 session，web 3001 与 API 3000
 * 是两个源，也不使用任何 cookie；以 cookie 为载体的 `csrf-csrf` 一类同样失效（跨源请求
 * 不带凭证时 cookie 不会被写入或回传）。因此按项目实际形态实现两层防护，不新增依赖。
 *
 * 为什么不开令牌接口：令牌随页面文档下发（`server/cli/web.ts` 与 Vite 开发服务注入
 * `<meta name="csrf-token">`）。开一个 `GET /csrf` 等于给所有站点一个「来取令牌」的入口，
 * 防护立刻退化成一个能自己拿钥匙的锁。
 *
 * 两层，缺一不可：
 *
 * 1. **来源校验**：`Origin` / `Referer` 由浏览器写入，脚本改不了。只接受「与 API 同主机 +
 *    配置端口」的页面发出的请求，从而挡住其它站点对本机服务的 drive-by 调用（本项目无鉴权，
 *    这是真正起作用的一层）。
 * 2. **令牌校验**：改变状态的方法必须带页面里的令牌。别的站点取不到它——它的来源读不到
 *    我们的 HTML，去读也会被第 1 层拒掉。
 *
 * 没有 `Origin` 与 `Referer` 的请求视为非浏览器客户端（curl、脚本）：来源校验放行，
 * 但写操作仍要先从页面源码里取一次令牌并放进请求头。浏览器无法伪造「没有来源头」的
 * 跨站请求，因此这不会削弱防护。
 */

/** 不改变状态的方法，不做令牌校验 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** 回环别名：`localhost` 与 `127.0.0.1` 互认，避免用户换一种写法就被拦 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
/** 密钥缓存时长：写请求很少，30 秒读一次文件足够，密钥被重建后也能自动跟上 */
const SECRET_CACHE_TTL = 30 * 1000;

const SERVER = __APP_CONFIG__.server;
const WEB = __APP_CONFIG__.web;

/** 允许的页面端口：web 静态站点、Vite 开发服务、API 自身，加上 http/https 默认端口 */
const ALLOWED_PORTS = new Set(
	[String(WEB.port), String(WEB.devWebPort), String(SERVER.port), '80', '443'].filter((port) => !!port),
);

let secretCache: { secret: string; at: number } | null = null;

/** 取安装级密钥，短时间缓存；文件被删除重建后最多 30 秒自愈 */
function currentSecret() {
	if (secretCache && Date.now() - secretCache.at < SECRET_CACHE_TTL) {
		return secretCache.secret;
	}
	const secret = readCsrfSecret(getDataDirectory());
	secretCache = { secret, at: Date.now() };
	return secret;
}

/** 解析 URL 或 `Host` 头里的主机名与端口，非法输入返回 `null` */
function parseSource(value: string) {
	let url: URL;
	try {
		url = new URL(value.includes('://') ? value : `http://${value}`);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return null;
	}
	// Origin 里的 IPv6 主机名带方括号（`[::1]`），统一去掉再比较
	const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (!hostname) {
		return null;
	}
	const fallback = url.protocol === 'https:' ? '443' : '80';
	return { hostname, port: url.port || fallback };
}

function isLoopback(hostname: string) {
	return LOOPBACK_HOSTS.has(hostname);
}

/**
 * 判断请求是否来自本应用自身。
 *
 * @param source `Origin` 优先，缺失时退到 `Referer`
 * @param requestHost 本次请求的 `Host` 头，用于确认页面与 API 访问的是同一台主机
 */
export function isAllowedSource(source: string | undefined, requestHost: string | undefined) {
	// 没有来源信息：非浏览器客户端，交给令牌校验
	if (isUndefined(source) || !source) {
		return true;
	}
	const origin = parseSource(source);
	const host = isUndefined(requestHost) ? null : parseSource(requestHost);
	if (!origin || !host) {
		return false;
	}
	if (!ALLOWED_PORTS.has(origin.port)) {
		return false;
	}
	// 页面主机必须是访问 API 用的主机，或两者都是回环别名
	return origin.hostname === host.hostname || (isLoopback(origin.hostname) && isLoopback(host.hostname));
}

function reject(ctx: Context, message: string, options: { token: boolean }): never {
	// 提前拒绝发生在路由之前，路由级 CORS 不会执行。令牌失效时来源已通过校验，
	// 回一个 `Access-Control-Allow-Origin`，前端才能读到原因；来源不合法就不回。
	const origin = ctx.get('origin');
	if (options.token && origin) {
		ctx.set('Access-Control-Allow-Origin', origin);
		ctx.vary('Origin');
	}
	throw new ApiError(Status.Forbidden, message, message);
}

/**
 * CSRF 中间件。
 *
 * 必须注册在路由之前：拒绝要在进入 controller 与数据层之前完成，
 * 否则「先改数据再报 403」等于没有防护。
 */
export function csrf(): Middleware {
	return async (ctx, next) => {
		const source = ctx.get('origin') || ctx.get('referer') || void 0;
		if (!isAllowedSource(source, ctx.get('host'))) {
			reject(ctx, '请求来源不被允许，已拒绝本次操作', { token: false });
		}
		if (SAFE_METHODS.has(ctx.method.toUpperCase())) {
			return await next();
		}
		if (!verifyCsrfToken(currentSecret(), ctx.get(CSRF_HEADER))) {
			reject(ctx, 'CSRF 令牌无效或已过期，请刷新页面后重试', { token: true });
		}
		return await next();
	};
}
