# 上游网络异常转为 502 / 504 并带可读消息

- 日期：2026-11-27
- 模块：server
- 类型：修复

## 背景

联调时 `match` 接口在 15 秒后返回 `500`，前端只显示「Request failed with status code 500」，服务端日志里才有 `请求超时（15000ms）`。

## 根因

`server/src/integrations/http.ts` 的 `requestJson()` 在拿到响应之前就失败时（超时、代理不可用、DNS 失败）直接 `reject` 原始 `Error`。这些错误没有被包装成 `ApiError`：

- Koa 错误中间件只处理 `ApiError`，其余异常一律回落成 500 且不带 message；
- 调用方也因此无法区分「上游超时」与「自己的代码出错」。

## 修复

`requestJsonWithRetry()` 在调用 `requestJson()` 时捕获网络层异常，统一经 `toUpstreamError()` 转换：

- 超时（消息含「超时 / timeout」）→ `Status.GatewayTimeout`（504），消息 `${host} 请求超时`；
- 其它网络失败 → `Status.BadGateway`（502），消息 `无法访问 ${host}：${原因}`。

重试逻辑不变：重试针对**已拿到响应**的 429/5xx；连接阶段失败重试没有意义，直接抛出。消息里只带主机名，不带完整 URL 与任何凭据。

## 涉及文件

| 文件                              | 改动                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `server/src/integrations/http.ts` | 新增 `toUpstreamError()`，包住网络异常               |
| `test/server/http-client.test.ts` | 4 个用例：正常响应、超时 504、连接失败 502、5xx 重试 |

## 行为变化与兼容性

- 上游不可用时，前端从「500 无消息」变成「504 请求超时 / 502 无法访问」的具体提示。
- 已有的 `upstreamError()`（HTTP 状态非 2xx 时抛 502）不变，二者不重复包装。

## 验证

- `pnpm exec vitest run test/server/http-client.test.ts`：4 个用例通过（超时用例使用 150ms 超时，5xx 重试用例约 800ms 退避）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
