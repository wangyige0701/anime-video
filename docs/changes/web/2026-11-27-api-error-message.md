# 业务错误的提示改用服务端响应体并去掉重复弹窗

- 日期：2026-11-27
- 模块：web
- 类型：修复
- 涉及模块：web

## 背景

合并功能把 `ApiError` 的失败路径暴露到 UI 上，才发现提示是坏的：服务端业务错误以「原始状态码 + `text/plain` 响应体」返回（`server/middlewares/error.ts` 里 `ctx.body = caught.getBody()`），axios 在这种情况下 `error.message` 只有 `Request failed with status code 400`，真正的原因躺在 `error.response.data` 里没人读。

结果是一次失败的合并会弹两条英文提示：拦截器弹一次 `Request failed with status code 400`，`handleMerge()` 的 `catch` 再弹一次同样的内容。

## 涉及文件

| 文件                                     | 改动                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| `web/src/utils/apiError.ts`              | 新建纯函数 `getPlainErrorMessage()`                         |
| `web/src/api.ts`                         | 拦截器优先使用纯文本响应体的消息                            |
| `web/src/components/index/IndexList.vue` | `handleMerge` / `handleDetach` 去掉重复的 `ElMessage.error` |
| `test/web/api-error.test.ts`             | 9 个用例覆盖响应体判定                                      |

## 实现要点

1. **只认 `text/plain` 响应体**：JSON 错误体（参数校验失败）会带一大段结构，弹给用户只是一屏乱码；HTML 错误页同理。判定条件放在纯函数里，拦截器只负责调用。
2. **不改既有分支的顺序**：`CanceledError` 静默透传、普通 `Error` 用自身 message、剩下的兜底「请求失败，请稍后重试」，全部保留；新增分支只处理「有纯文本响应体」这一种此前没有被正确读到的情形。
3. **组件不再重复提示**：这与 Bangumi 同步入口的既有约定一致（提示统一由 `api.ts` 给出）。`handleMerge()` 仍然返回 `false` 交给拖拽层收尾，只是不再弹自己的提示。
4. **`data?.message` 加可选链**：原实现在 `error` 不是 `Error` 且无响应体时会直接读 `undefined.message` 抛二次异常，顺手修掉。

## 行为变化与兼容性

- 业务错误（合并/脱离等 `ApiError`）：由英文状态码改为服务端给的中文原因，且只弹一次。
- HTTP 200 + `success: false`：行为不变，仍在拦截器内 `throw new Error(message)`，由调用方决定是否展示。
- 参数校验失败（400 + JSON）：仍是 axios 的英文消息，未改动——这类错误只会在前端参数拼错时出现，属于开发者向。
- 网络错误、取消请求、5xx 纯文本：网络错误不变；5xx 纯文本会显示 `Internal Server Error`（原来是英文状态码，两者都是英文，但更准确）。

## 验证

- `pnpm exec vitest run test/web/api-error.test.ts`：9 个用例通过（纯文本、trim、JSON、非 text/plain、无 content-type、非字符串、空白、无响应体、null/原始值）。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：全量通过。
- 接口实测：`POST /data/series/:id/merge`（合并到自身）返回 `400 text/plain` + `不能将系列合并到自身`，前端据此展示中文提示。
