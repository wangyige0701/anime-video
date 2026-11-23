# 系列状态「全部」不再作为可写状态

- 日期：2026-11-23
- 模块：shared
- 类型：修复
- 涉及模块：shared、server、web

## 背景

`shared/series-status.ts` 的枚举第一项是 `{ id: 1, name: '全部' }`，它只表示首页「不按状态过滤」，并不是系列自身的状态。但三处规则不一致：

- 控制器用 `min = seriesStatus[0].id`、`max = seriesStatus.at(-1).id` 做范围校验，范围是 1~4，接口因此接受 `status: 1` 并把「全部」写进 `.video.json`。
- `DetailStatus.vue`、`IndexFilterBar.vue` 各自用 `filter(item => item.id > 1)` 隐式过滤，规则写在组件里，且依赖 id 连续递增。
- `getSeriesStatusName(1)` 会返回「全部」，等于承认「全部」是一个合法状态名。

一旦有数据真的存成 1，详情页选择器没有对应选项、状态名却显示「全部」，排查时很难看出是脏数据。

## 改动

| 文件                                                               | 改动                                                                         | 原因                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `shared/series-status.ts`                                          | 新增 `SERIES_STATUS_ALL`、`writableSeriesStatus`、`isWritableSeriesStatus()` | 把「可写状态」从筛选枚举中显式拆出         |
| `shared/series-status.ts`                                          | `getSeriesStatusName()` 改为只在可写状态里查找                               | 系列状态名不应出现「全部」                 |
| `server/controller/SeriesController.ts`                            | 状态校验由 `min/max` 改为 `isWritableSeriesStatus()`                         | 接口拒绝「全部」，也不再假设 id 连续       |
| `web/src/components/detail/DetailStatus.vue`、`IndexFilterBar.vue` | 改用 `writableSeriesStatus`                                                  | 删除组件内重复的 `id > 1` 过滤             |
| `test/series-status.test.ts`                                       | 新增 6 个用例                                                                | 覆盖可写集合、哨兵拒绝、非法数字与名称查询 |

## 行为变化与兼容性

- `PUT /series/:seriesId/status` 传 `status: 1` 现在返回 400（Zod 校验失败，提示「系列状态无效」），原先会写入成功。前端从未发送 1，页面行为不变。
- 其余状态值与 `DELETE /series/:seriesId/status`（置 0）语义不变，0 仍表示「未设置」。
- 若历史数据中存在 `status: 1`，服务端读取时不再给出状态名（返回空串），详情页显示为未设置状态。没有做自动迁移：这类数据本就不该存在，静默改写配置的风险高于让它在界面上显示空状态。
- `getSeriesStatusName()` 与 `isWritableSeriesStatus()` 均为纯函数，前端引用 `writableSeriesStatus` 后两处 `id > 1` 的隐式约定消失。

## 验证

- `pnpm exec vitest run`：16 个文件、163 个用例全部通过（新增 6 个）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm --filter web type-check`：通过。
- 未做的手工项：详情页选状态、清除状态、首页按状态过滤的点击验证（本地无浏览器自动化环境）；相关请求由控制器 Zod 校验与 `shared` 纯函数用例覆盖。
