# Bangumi 数据同步

## 职责边界

本模块负责把 Bangumi 的元数据与本地视频目录整合：

- 从 Bangumi 搜索条目、读详情与剧集列表；
- 用规则（必要时用模型）把「本地季目录 → 条目」「本地文件 → 官方剧集」对应起来；
- 把系列字段、季标题、集标题与集顺序写入 `.video.json`。

不负责：数据层的扫描与持久化（见 `server/AGENTS.md` 的「系列、季、集数据层」）、前端的展示与确认（见 `web/AGENTS.md` 的「详情页 Bangumi 同步」）。

代码在 `server/src/integrations/`：

| 文件                   | 职责                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `env.ts`               | `.env` 定位与解析、`pickString` / `pickNumber` 的优先级取值 |
| `http.ts`              | 最小 JSON 客户端：CONNECT 隧道、超时、429/5xx 退避重试      |
| `bangumi/config.ts`    | `BANGUMI_*` / `BGM_*` 配置解析与缓存                        |
| `bangumi/client.ts`    | 搜索、条目详情、剧集分页                                    |
| `bangumi/filenames.ts` | 文件名集号解析、特别篇标记、自然排序                        |
| `bangumi/align.ts`     | 官方剧集归一化与「文件 ↔ 官方集」的规则对齐                 |
| `bangumi/prompts.ts`   | 季映射与集对齐的提示词契约与结果校验                        |
| `bangumi/tags.ts`      | 标签到系列类型的映射（规则命中 → 剩余交模型）               |
| `bangumi/sync.ts`      | 三段流程的编排、预览构建、写入                              |
| `ai/client.ts`         | OpenAI 兼容的 JSON 客户端（兼容性降级）                     |

Bangumi 与 AI 是两个独立模块，互不引用；只有 `env.ts` / `http.ts` 是共用的。

## 配置优先级

`pickString` / `pickNumber` 统一按「进程环境变量 → `.env` → `config.yaml` 默认值」取值。

- 为什么不直接读合并后的 `__APP_CONFIG__`：`config-parser` 会把进程环境合并进去，合并后无法区分「来自环境」与「来自默认值」，`config.yaml` 的默认值会永久压住 `.env`，本地调试改 `.env` 看起来毫无效果。
- `.env` 的位置由 `resolveEnvFile()` 决定：先看 `cwd/.env`，再看模块位置上溯三级的 `.env`（源码里即仓库根）。**不能只用 cwd**——`pnpm --filter server run dev` 与 `back.cmd` 都会把工作目录切到 `server/`，而 `.env` 在仓库根目录，只按 cwd 找会静默读不到，表现为超时或「AI 未配置」。
- 两个代理互相独立，不做继承：`BGM_PROXY` 只作用于 Bangumi，`AI_PROXY` 只作用于 AI。

## Bangumi 数据模型

剧集只有三个字段有用，含义容易混淆：

| 字段   | 含义                                                              | 是否落库                       |
| ------ | ----------------------------------------------------------------- | ------------------------------ |
| `type` | 0 本篇（含第 0 话）、1 特别篇、2 OP、3 ED、4 PV/CM、5 MAD、6 其他 | 只用于分类                     |
| `sort` | 播出顺序号，可跨条目连续，可为 0 或小数                           | 否（仅 `officialSort` 供核对） |
| `ep`   | 条目内 1-based 序号，跨条目重复，SP 恒为 0                        | **完全不用**                   |

因此：

- 排序键必须是 `(partIndex, sort)`，`type` 只保留 0/1；`type=4` 的 PV 也可能是 `sort=0`，混进来会与「第 0 话」抢同一个位置。
- 项目内的 `sort` 是 1..N 的连续位置号，不承载「第几集」语义，写入统一走 `Season.rewriteEpisodeOrder(ids)`。

## 三段接口

| 方法 | 路径                                     | 作用                                     | 写库 |
| ---- | ---------------------------------------- | ---------------------------------------- | ---- |
| POST | `/data/series/:seriesId/bangumi/match`   | 搜索 + 模型季映射，返回候选与建议        | 否   |
| POST | `/data/series/:seriesId/bangumi/preview` | 按确认的映射拉详情与剧集，生成 changeSet | 否   |
| POST | `/data/series/:seriesId/bangumi/apply`   | 校验后写入系列字段、季标题、集标题与顺序 | 是   |

`BangumiController` 只做「取实体 → 调编排 → 记日志」，参数模式在 `src/schema/bangumi-sync.ts`（`preview` 每季最多三个条目、`apply` 的排序数组形状），归属校验在编排层（需要读数据层）。

## 顺序基准

**顺序只由本地文件名决定**，官方数据只提供标题与对应关系。

1. `parseEpisodeNumber()` 按可靠性从高到低解析集号：`SxxEyy` → 「第 N 话」→ 方括号/圆括号编号 → ` - N` → 前缀编号；分辨率、编码、音轨、年份、CRC 会被过滤。
2. 前缀规则同时接受 `-` 分隔，所以 `00-特别篇.mp4` 解析为第 0 集——它是正片第 0 话，不是附加特别篇。文件名里的「特别篇 / SP / OVA」不能反推内容类型。
3. `orderLocalFiles()`：有集号的按集号升序（0 在最前），无集号的按自然序追加到末尾。**不能用字符串排序**：`[Studio GreenTea] ... S3 [09]` 会排到 `01.mp4` 之前，混排目录整季错位。
4. 无集号的文件不插入正片中间：位置无法从名字确定，交人工处理。

## 规则优先对齐

`alignByRules()` 能用集号形成唯一映射就不调模型：

1. 本地集号重复 → 直接 `resolved: false`；
2. 本地集号匹配官方正片的 `sort` → 归属；
3. 剩余文件先按官方特别篇的 `sort` 精确匹配，再看「文件名带特别篇标记且只剩一个特别篇」的兜底；
4. 仍归不了 → `resolved: false` 并给出原因，由模型接手。

`resolved: false` 时 `runPreview()` 才调一次模型，且只传该季的文件与官方集。模型返回的映射仍要经过双射校验（每个文件一条、每条官方集最多用一次），**顺序继续取自本地文件名**——提示词里明确要求模型只做对应关系、不参与决定顺序。

官方有、本地没有的集只写入 `missing` 供前端提示，不阻断对齐（用户没下载是正常状态）。

## 预览与写入

- `preview` 的季内条目顺序按条目首播日期升序决定 `partIndex`，不使用前端传入顺序：split cour 的两个条目顺序错了，官方集序列会整体错位。
- 系列字段（标题/描述/日期/状态/类型）直接取接口，不经模型；只有标签 → 类型需要整合：先按同名精确匹配，剩余交模型，避免把制作公司名塞成类型。
- 状态由官方剧集的 `airdate` 推导：首播在未来 → 4，仍有未播 → 2，全部已播 → 3，没有日期 → 0（不猜）。
- `apply` 把入参当作不可信输入：排序数组必须是该季全部集的一个排列（`validateOrder` 校验长度/重复/归属）、季与集必须属于该 series、类型必须落在 `seriesTypes` 范围、状态必须是可写状态。任一失败整次抛错，不做部分写入；写完后统一 `waitDataSave()`。

## 错误与日志

- 上游 HTTP 非 2xx 由各 `client.ts` 的 `upstreamError()` 抛 502；拿到响应之前的失败（超时、代理不可用、DNS）由 `http.ts` 的 `toUpstreamError()` 转成 504 / 502，并把主机名写进消息——**不能让它回落成 500**：Koa 只处理 `ApiError`，其余异常没有 message，前端只能看到「请求失败」。
- 配置缺失抛 503（例如未配置 AI）。
- 所有状态码通过 `Status` 枚举引用，不写字面量。
- 日志用结构化字段：`series.bangumi.matched` / `previewed` / `applied`，只记 seriesId、季数、候选数、写入字段，不记提示词与密钥。

## 本地回归

`test/server/bangumi-*.test.ts` 的内联构造覆盖规则与编排；`bangumi-align.test.ts` 里有一组 `describe.skipIf(!hasRaw)` 的用例会读取 `.cache/bangumi-raw` 下的真实响应做回归——真实响应不入库，缺失时自动跳过。

## 相关文档

- `docs/changes/server/2026-11-27-bangumi-sync-api.md`
- `docs/changes/server/2026-11-27-bangumi-align-rules.md`
- `docs/changes/server/2026-11-27-ai-integration-prompts.md`
- `docs/changes/server/2026-11-27-env-file-path.md`
- `docs/changes/server/2026-11-27-http-upstream-errors.md`
