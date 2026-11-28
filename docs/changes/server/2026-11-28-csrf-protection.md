# 新增 CSRF 防护：令牌随页面下发

- 日期：2026-11-28
- 模块：server
- 类型：功能

## 背景

本项目没有鉴权：`server` 监听 `0.0.0.0:3000`，`@Cors()` 默认 `Access-Control-Allow-Origin: *`，任何网站都能向本机 API 发请求并改数据（合并、排序、改标题、删状态）。Web 与 API 还是两个源（生产 `3001 → 3000`，开发 `5173 → 3000`），没有任何 cookie 或 session。

## 插件调研结论

- `koa-csrf`（koajs/csrf，5.0.1）：npm 已标记 deprecated，最后发版 2022 年；令牌存 session、从 body 的 `_csrf` 读，需要 `koa-session` / `koa-generic-session`。
- 以 cookie 为载体的方案（`@koa/csrf`、`csrf-csrf` 一类）：跨源 XHR 不带凭证时 cookie 既不会被写入也不会回传，本项目要引入 cookie + `withCredentials` + 收紧 CORS 才能生效，收益不抵改动。

本项目 `web` 与 `server` 没有 session、不使用 cookie，因此**不新增依赖**，按现有形态实现两层防护（依赖增删仍必须走 `pnpm`）。

## 设计

### 1. 来源校验（真正起作用的一层）

`Origin`（缺失退回 `Referer`）必须满足：

- 主机与本次请求的 `Host` 相同，或两者都是回环别名（`localhost` / `127.0.0.1` / `::1` 互认）；
- 端口属于 `web.port`、`web.devWebPort`、`server.port`，或 http/https 默认端口（80/443）。

`Origin: null`、`file://`、`chrome-extension://` 一律拒绝。跨站页面无法伪造这两个头，所以「其它网站借用户的浏览器调本机服务」被挡在门外。预检请求（OPTIONS）同样走这层，跨站预检直接被拒，浏览器不会发出真实请求。

### 2. 令牌校验

`GET`/`HEAD`/`OPTIONS` 之外的方法必须带 `x-csrf-token`。令牌是 `签发时间(36 进制).随机串.HMAC-SHA256`，密钥为安装级随机值，无状态、不需要服务端存储，有效期 7 天。

**令牌随页面文档下发，不开接口**：静态页服务在返回 `index.html` 时写入 `<meta name="csrf-token">`；开一个 `GET /csrf` 等于给所有站点一个「来取令牌」的入口，防护会退化成能自己拿钥匙的锁。

### 3. 密钥文件

`<应用数据目录>/.csrf-secret`（与 `settings.json` 同级，权限 0600）：先启动的进程创建，其它进程读取。API 与静态页服务是两个进程，共用一个文件才能互认签出的令牌。不放进 `config.yaml`（随包分发，密钥必须每台机器唯一），也不提交仓库（`.gitignore` 已加 `.csrf-secret`）。删除后自动重建，代价是旧令牌失效、页面刷新即可。

## 改动

| 文件                          | 内容                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `shared/csrf.ts`              | 请求头名、meta 名称、占位符（两端共用，纯常量）             |
| `shared/csrf-secret.ts`       | 密钥读写、签发、校验、页面注入（仅 Node）                   |
| `server/src/security/csrf.ts` | 来源规则 + 中间件，密钥 30 秒缓存                           |
| `server/cli/server.ts`        | `response()` 之后、路由之前注册 `csrf()`                    |
| `server/cli/web.ts`           | 返回 `index.html` 时注入 meta；模板缓存一次，令牌按请求替换 |
| `web/src/utils/csrf.ts`       | 从 meta 读令牌；`isSafeMethod()` 判定是否需要令牌           |
| `web/src/api.ts`              | 请求拦截器给写操作补 `x-csrf-token`                         |
| `web/vite.config.ts`          | 开发服务插件，调用服务端同一个 `injectCsrfHtml()`           |
| `.gitignore`                  | 忽略 `.csrf-secret`                                         |

## 关键约束

- **开发与发布共用同一份实现**：Vite 插件只有一行——把 HTML 交给 `injectCsrfHtml()`，与 `server/cli/web.ts` 完全同一函数，密钥文件也同一个。插件 `apply: 'serve'`，构建产物里不带任何构建期令牌，否则发布后页面上会留着一个过期令牌。
- **中间件必须在路由之前**：拒绝要发生在 controller 与数据层之前，否则「先写数据再报 403」等于没防护。
- **无 `Origin`/`Referer` 视为非浏览器客户端**：来源放行，但写操作仍要令牌。浏览器无法伪造「没有来源头」的跨站请求，所以不放宽防护；也不能为脚本客户端加来源白名单绕过。
- **失效不静默重试**：页面里的令牌不会自己变新，重试只会再失败一次，直接把服务端文案（「请刷新页面后重试」）弹给用户。
- 新增入口 HTML 时必须同样注入 meta；新增写接口无需额外处理，按方法统一校验。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm --filter web type-check`、`pnpm --filter web build` 通过；构建产物 `web/dist/index.html` 不含 `csrf-token`（插件仅开发期生效）。
- `pnpm exec vitest run test/server/csrf.test.ts test/web/csrf.test.ts`：24 例通过，覆盖签发/校验（正常、超期、篡改、换密钥、空值与缺段）、密钥文件创建与重建、页面注入（占位符替换 / 插到 `</head>` 前）、来源规则（本机、回环别名、同主机异端口、外站、非法协议、无来源头）与中间件放行/拒绝。
- 起一个只挂 `error` + `csrf` 的最小 Koa 实例，逐个 curl 验证：

| 场景                                       | 结果                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `GET` + `Origin: http://localhost:5173`    | 200                                                                               |
| `GET` + `Origin: https://evil.example.com` | 403「请求来源不被允许」                                                           |
| `POST` 无令牌 + 合法来源                   | 403「CSRF 令牌无效或已过期」，响应带 `Access-Control-Allow-Origin` 便于前端读文案 |
| `POST` 带令牌 + 合法来源                   | 200                                                                               |
| `POST` 带令牌 + 恶意来源                   | 403「请求来源不被允许」，且不回 CORS 头                                           |
| `POST` 无来源 + 令牌（脚本客户端）         | 200                                                                               |
| `OPTIONS` 预检 + 恶意来源                  | 403（浏览器因此不会发出真实请求）                                                 |

## 已知限制

- 页面里的令牌不会自动续期：标签页开着超过 7 天后写操作会失败，提示刷新页面。静态页服务每次返回 HTML 都会重新签发，刷新即恢复。
- 若通过反向代理把 Web 换成别的端口对外服务，需把该端口加入 `ALLOWED_PORTS`，否则所有写操作会被来源校验拒绝（服务端日志记录 `http.request.rejected`）。
- 响应体仍可被跨站脚本读取（`Access-Control-Allow-Origin: *` 未改），本层只解决「被冒用身份改数据」，不解决读接口的信息可见性。
