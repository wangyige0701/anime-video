# 新增 Bangumi 同步三段接口与写入流程

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server、shared

## 背景

前置验证已经确认数据可用，但验证脚本是「一次跑完就写结果」的形态，不符合实际使用：季与条目的对应、集标题的继承都需要人工确认，任何一步判断错都会把错误数据写进 `.video.json`。

本次把同步拆成三段接口，前两段只读，第三段才写库。

## 目标与取舍

- **match → preview → apply** 三段式。每段返回完整结果，前端逐步确认；任一步失败不会留下半套数据。
- 系列标题、描述、日期、状态直接取接口，不经过模型。只有「季映射」「规则无法消解的集对齐」「标签映射」三处调用模型。
- 顺序由本地文件名决定，落库 `sort` 是 `1..N` 位置号，Bangumi 的 `sort` 只作为 `officialSort` 供核对。
- `apply` 的入参来自前端，必须视为不可信：季/集归属、排序数组完整性、状态与类型合法性全部在服务端复核。
- 一次 `apply` 内所有校验前置完成，再开始写入；写完后统一 `waitDataSave()`。

## 接口

| 方法 | 路径                                     | 作用                                     | 是否写库 |
| ---- | ---------------------------------------- | ---------------------------------------- | -------- |
| POST | `/data/series/:seriesId/bangumi/match`   | 搜索 + AI 季映射，返回候选与建议         | 否       |
| POST | `/data/series/:seriesId/bangumi/preview` | 按确认的映射拉详情与剧集，生成 changeSet | 否       |
| POST | `/data/series/:seriesId/bangumi/apply`   | 校验后写入系列字段、季标题、集标题与排序 | 是       |

## 涉及文件

| 文件                                      | 改动                   | 原因                                   |
| ----------------------------------------- | ---------------------- | -------------------------------------- |
| `server/src/integrations/bangumi/sync.ts` | 编排、纯逻辑与写入     | 三段流程的实现                         |
| `server/src/schema/bangumi-sync.ts`       | preview/apply 参数模式 | 参数校验集中在 schema                  |
| `server/controller/BangumiController.ts`  | 三个端点与本地季读取   | 接口层只做注入与日志                   |
| `test/server/bangumi-sync.test.ts`        | 23 个用例              | 描述清理、状态推导、单季预览、排序校验 |

## 实现要点

1. **`match`**：关键词取系列标题与目录名去重后各搜一次，候选按首播日期排序；本地季摘要只传「文件数、无法解析集号的文件数、3 个样例文件名」，控制 token。
2. **`preview` 的季内条目顺序**：按条目首播日期升序决定 `partIndex`，而不是按前端传入顺序——split cour 的两个条目顺序错了，官方集序列就整体错位。
3. **规则优先**：每季先 `alignByRules`，只有 `resolved === false` 才调一次模型；模型返回的映射仍要经过双射校验，且**顺序继续取自本地文件名**。
4. **`buildSeasonPreview`**：按 `orderLocalFiles` 排序后逐项编号；未匹配的文件保留原文件名标题并排在末尾，不静默丢弃；官方缺集写入 `missing` 供前端提示。
5. **状态推导**：用官方剧集的 `airdate` 判断，首播在未来→4、仍有未播→2、全部已播→3、没有日期→0（不猜）。
6. **`apply` 校验**：`validateOrder` 要求排序数组是该季全部集的一个排列（长度、重复、归属），季与集必须属于该 series，`types` 必须落在 `seriesTypes` 范围内，`status` 必须是可写状态。任一失败整次抛错，不做部分写入。
7. **错误状态码**：全部通过 `Status` 枚举引用，上游失败用 502、配置缺失用 503。

## 行为变化与兼容性

- 纯新增接口，不影响既有 `/data/series/*` 端点、数据文件结构与前端交互。
- 新增 `Status.ServiceUnavailable`、`Status.GatewayTimeout` 两个枚举成员，仅追加。
- `apply` 会覆盖系列的 title/description/date/status/types 与季标题、集标题和顺序；前端需在勾选后再提交，未传的字段不修改。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run test/server`：12 个文件 114 个用例通过。
- 新增用例覆盖：描述清理、日期解析、四种状态、季摘要样例、规则命中、规则失败走 AI、规则失败无 AI 时标记待人工、未匹配文件排末尾、季标题合并、候选去重排序、排序数组校验。
- **未自动化的部分**：`applyChangeSet` 的真实落库路径（需要完整数据层夹具与目录白名单）未写集成测试，落库方法本身由 `server/test/video.test.ts` 的 `rewriteEpisodeOrder`、`updateTitle` 用例覆盖；接口级联调在下一批次与前端口径一起手工验证。

## 关联文档

- `docs/changes/server/2026-11-27-bangumi-align-rules.md`
- `docs/changes/server/2026-11-27-ai-integration-prompts.md`
