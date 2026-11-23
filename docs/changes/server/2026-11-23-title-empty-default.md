# 标题空值恢复默认标题并集中字段参数模式

- 日期：2026-11-23
- 模块：server
- 类型：功能
- 涉及模块：server、docs

## 背景

标题、描述允许为空本来就是设计的一部分，但上一轮把 `title` 的参数模式收紧成 `min(1)`，等于在接口层禁止了空标题。实际语义应当是：

- 标题为空 → 恢复默认标题（系列用系列目录名，季用季目录名，集用文件名去掉扩展名），而不是报错，也不应该把空串落库。
- 描述为空 → 清空描述，同样合法。
- 字符串去首尾空白后再判断，`'   '` 等同于空。

同时季、集的参数模式还散落在 `@Validate((z) => z.object({...}))` 里，没有像 series 一样集中到 `src/schema/`，既不能单独测试，也无法保证三处规则一致。

## 改动

| 文件                                                          | 改动                                                                | 原因                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `AGENTS.md`                                                   | 新增「可编辑文本字段的空值语义（强制）」                            | 把空标题、空描述的约定写成跨端规范                     |
| `server/src/schema/series-fields.ts`                          | `title` 改为 `z.string().trim()`                                    | 允许空标题，交给数据层还原默认值                       |
| `server/src/schema/season-fields.ts`                          | 新增季标题与排序模式                                                | 与 series 一致的集中位置                               |
| `server/src/schema/episode-fields.ts`                         | 新增集标题与排序模式                                                | 同上                                                   |
| `server/data/series.ts`                                       | `updateTitle()` 归一化为 `title.trim() \|\| name`                   | 空标题落库为默认标题，与 `resolveTitleConfig()` 同规则 |
| `server/data/season.ts`                                       | 同上，回落到 `seasonName`                                           | 季目录名                                               |
| `server/data/episode.ts`                                      | 同上，回落到文件名去扩展名                                          | 与 `resolveEpisodeConfig()` 同规则                     |
| `SeriesController`                                            | 标题端点返回 `ctx.Success(实际标题)`，`commitSeries()` 改为返回实体 | 前端需要知道还原后的标题                               |
| `SeasonController`、`EpisodeController`                       | 改用集中模式，标题端点返回实际标题                                  | 三处语义统一                                           |
| `test/server/series-fields.test.ts`                           | 改为断言空标题合法、纯空白归一为空串                                | 校验语义反转                                           |
| `test/server/season-fields.test.ts`、`episode-fields.test.ts` | 新增各 4 个用例                                                     | 标题去空白与排序边界                                   |
| `server/test/video.test.ts`                                   | 三处补空标题回落断言                                                | 覆盖真实落库路径                                       |

## 行为变化与兼容性

- 空标题不再返回 400，而是写入默认标题；`PUT .../title` 的响应 `data` 由 `null` 变为实际标题字符串。仓库内唯一调用方是 web 数据层，随下一次提交同步；其他客户端若严格校验 `data === null` 需调整。
- 纯空白标题等同于空标题，落库为默认标题，不会存成空格串。
- 季排序参数由 `z.number().min(1)` 收紧为整数，`1.5` 现在被拒绝；前端排序请求始终传整数。
- 描述、日期、状态端点行为与日志事件不变；标题日志补充了 `title` 字段（写入前的原始值）。

## 验证

- `pnpm exec vitest run`：19 个文件、179 个用例全部通过（新增 12 个，含 season/episode 各 4 个）。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `server/test/video.test.ts` 的三处新断言覆盖「空字符串 / 纯空白 → 默认标题」的真实读写路径（系列目录名 `视频1`、季目录名 `第一季`、集文件名 `1.mp4` → `1`）。
- 未做的手工项：详情页实际清空标题并失焦保存；前端改动在下一批次完成。
