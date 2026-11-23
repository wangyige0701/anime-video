# 详情页支持编辑系列标题，三处标题与描述放行空值

- 日期：2026-11-23
- 模块：web
- 类型：功能
- 涉及模块：web
- 关联：`docs/changes/server/2026-11-23-title-empty-default.md`

## 背景

服务端已按「空标题恢复默认标题、空描述清空」调整，前端还停在旧规则：

- 详情页顶部的系列标题是纯文本 `<div>`，无法编辑。
- `DetailDescription.vue` 拦截空描述并提示「描述不能为空」。
- `DetailSeason.vue` 拦截空的季标题、集标题并提示「不能为空」。

同时，标题设为空后服务端会把默认标题写回并返回，前端若只做乐观更新，本地会停在空串直到刷新页面。

## 改动

| 文件                                      | 改动                                                                               | 原因                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `views/[seriesId]/[name].vue`             | 系列标题由 `<div>` 换成 `TextEditor`（`showEditIcon`），新增 `updateSeriesTitle()` | 详情页可编辑系列标题                                         |
| `components/detail/DetailDescription.vue` | 去掉空描述拦截                                                                     | 描述允许清空                                                 |
| `components/detail/DetailSeason.vue`      | 去掉季/集标题的非空拦截                                                            | 标题允许清空                                                 |
| `data/common.ts`                          | `patchField()` 新增可选 `settle`，新增 `serverTitle()`                             | 请求成功后用服务端返回值纠正本地值                           |
| `data/{series,season,episode}.ts`         | `updateTitle()` 先 trim，并传 `serverTitle` 作为 settle                            | 提交空串后本地立即显示默认标题                               |
| `api/{series,season,episode}.ts`          | 标题请求的返回类型改为 `string`                                                    | 与接口返回的实际标题对齐                                     |
| `web/test/data-patch.test.ts`             | 新增 4 个用例                                                                      | 覆盖 settle 覆盖、空返回值保留、失败回滚、`serverTitle` 过滤 |

## 实现要点

`patchField()` 的 `settle` 只在请求成功后执行，返回 `undefined` 表示不调整本地值，因此失败回滚路径不受影响：

```ts
const result = await status.run(key as string, commit);
const settled = settle?.(result);
if (settled !== undefined) {
	target.value = settled as T[K];
}
```

三个 `updateTitle()` 都先 `title.trim()` 再提交，`serverTitle()` 只接受非空字符串，避免用 `''` 或非字符串覆盖本地值。

## 行为变化与兼容性

- 详情页顶部标题可点击编辑图标进入编辑；失焦保存。清空后立即显示默认标题（系列目录名），不再是空白或报错。
- 季标题、集标题清空后分别显示季目录名、文件名去扩展名。
- 剧情简介清空后显示为空，不再弹「描述不能为空」。
- 标题与描述提交前统一 trim；纯空白内容等同于空值。
- 请求失败仍按原逻辑回滚并保持编辑前的值。

## 验证

- `pnpm exec vitest run`：19 个文件、183 个用例全部通过（新增 4 个）。
- `pnpm --filter web type-check`：通过。
- `pnpm --filter web build`：构建成功（`built in 3.63s`）。
- 未做的手工项：详情页实际点击编辑图标、清空标题失焦、清空描述保存的界面验证。本地无浏览器自动化环境；本地值同步由 `web/test/data-patch.test.ts` 覆盖，服务端回落由 `server/test/video.test.ts` 覆盖。
