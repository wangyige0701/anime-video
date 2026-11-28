/**
 * CSRF 的跨端约定：请求头名、页面承载位置与注入占位符。
 *
 * 令牌**随页面下发**，不单独开接口：静态页服务（`server/cli/web.ts`）与 Vite 开发服务
 * 在返回 `index.html` 时注入 `<meta name="csrf-token">`，前端启动时直接读 DOM。
 * 这样首屏不多一次往返，令牌也不会出现在任何可被跨站读取的接口响应里。
 *
 * 本文件不依赖 Node 与浏览器 API，两端共用；签名与密钥文件在 `shared/csrf-secret.ts`（仅 Node）。
 */

/** 客户端回传令牌的请求头 */
export const CSRF_HEADER = 'x-csrf-token';

/** 页面里承载令牌的 meta 名称，注入方与读取方必须一致 */
export const CSRF_META_NAME = 'csrf-token';

/**
 * 注入时的占位符。
 *
 * 静态页服务只把 `index.html` 读一次并缓存模板，令牌按请求替换，
 * 因此占位符必须能在每次请求里被安全替换（用字符串切分而不是正则）。
 */
export const CSRF_TOKEN_PLACEHOLDER = '__CSRF_TOKEN__';
