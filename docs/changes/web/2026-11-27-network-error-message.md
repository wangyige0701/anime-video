# 网络层失败改为中文可操作提示

- 日期：2026-11-27
- 模块：web
- 类型：修复
- 涉及模块：web

## 背景

点击「生成预览」时弹出的是 `Network Error`——axios 的英文原文被拦截器原样透出（旧实现 `if (error instanceof Error) ElMessage.error(error.message)`）。这句话对用户没有信息量，也掩盖了真实原因。

排查结论：`POST /data/series/:id/bangumi/preview` 在本地实测耗时 6.3 秒并返回 200，接口本身正常。会出现「请求没拿到任何响应」的情形集中在两类：

1. 服务端进程当时不可用——`pnpm run dev` 是 `tsx watch --tsconfig tsconfig.json app.ts server`，**监听整个 `server` 目录**，任何服务端文件变更都会重启进程，重启窗口内的请求直接连接重置；
2. 上游链路超时——`preview` 会串行调用 Bangumi 与 AI 接口（`chatJson` 默认 60s，`requestJsonWithRetry` 对 429/5xx 退避重试），慢的时候单请求可达数十秒。

这两种都没有响应体，`error.message` 只会是 axios 的英文。修复方向不是屏蔽错误，而是把「连接失败 / 超时 / HTTP 状态」翻译成能指向下一步动作的中文。

## 涉及文件

| 文件                         | 改动                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `web/src/utils/apiError.ts`  | 新增 `getApiErrorMessage()` 作为唯一出口，补网络层与状态码分支  |
| `web/src/api.ts`             | 拦截器只调用 `getApiErrorMessage()`，删除多层 `instanceof` 判断 |
| `test/web/api-error.test.ts` | 补充 7 个用例，含「不得出现英文 axios 文案」的反向断言          |

## 实现要点

1. **三层来源按优先级取文案**：`text/plain` 响应体（业务原因最准确）→ 网络错误码 → HTTP 状态码兜底。任一层给出结果就返回，不会再落到英文 `message`。
2. **网络错误码映射**：`ERR_NETWORK` / `ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET` → 「无法连接服务端，请确认服务端已启动后重试」；`ECONNABORTED` / `ETIMEDOUT` / `ESOCKETTIMEDOUT` → 「请求超时，服务端处理时间过长，请稍后重试」。
3. **`ERR_CANCELED` 返回空串**：主动取消（翻页、重发）不算失败，调用方据此跳过提示。拦截器仍保留 `instanceof axios.CanceledError` 的早退，两道判定互不影响。
4. **有状态码但没可读响应体时**用 `请求失败（HTTP 500），请稍后重试`：服务端兜底 500 的响应体是 `Internal Server Error`，同样没有信息量。
5. **兜底不再有英文**：`getApiErrorMessage()` 的每条分支都返回中文或空串，`api.ts` 里原来「只剩英文 message 就照着弹」的路径被删掉。

## 行为变化与兼容性

- 断网 / 服务端未启动：由 `Network Error` 改为中文提示，并指明下一步动作。
- 超时：由 `timeout of 60000ms exceeded` 改为中文提示。
- 业务错误（`ApiError` + `text/plain`）：不变，仍显示服务端给的原因。
- 主动取消：不变，静默。
- 参数校验失败（400 + JSON）：行为不变，仍不直接弹给用户（`getPlainErrorMessage()` 只认 `text/plain`）。

## 验证

- `pnpm exec vitest run test/web/api-error.test.ts`：16 个用例通过，其中「Should never return an English axios message」用 4 种错误形状的数组断言不出现 `request failed` / `network error` / `timeout of`。
- `pnpm --filter web type-check`、`pnpm exec vitest run`：全量 35 文件 / 350 用例通过。
- CDP 实测：详情页打开同步对话框、`match` 成功、用 `Network.emulateNetworkConditions({ offline: true })` 断网后点「生成预览」，提示为「无法连接服务端，请确认服务端已启动后重试」，仍停留在第一步，按钮已从 loading 恢复可点。
- 恢复联网后重跑完整流程：`POST preview` 返回 200（6.3s），进入第二步并展示 15 项待应用变更。
