# 新增文件名解析与剧集对齐规则

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server

## 背景

Bangumi 同步的核心不是「调接口」，而是「把本地文件对应到官方剧集」：

- 顺序必须来自本地文件名。Bangumi 的 `sort` 是播出序号（可为 `0`、`18.5`，跨条目连续），项目内 `sort` 是 `1..N` 位置号，直接互写会立刻出错。
- 官方剧集不能按 `ep` 判断。真实数据里第 0 话是 `type=0, sort=0, ep=1`，SP 是 `type=1, ep=0`。
- `type=4` 的 PV/CM 也带 `sort=0`，与第 0 话抢同一个位置。

这些结论来自 `.cache/` 的前置验证，但验证脚本是单文件、无测试、不能直接被服务端复用。

## 目标与取舍

- 把判定规则做成纯函数，输入输出都是普通对象，不依赖 Data 层、不读文件系统。
- **顺序只由本地文件名决定**：解析出的集号升序，第 0 话在最前；解析不出的追加末尾。
- 官方数据只提供「文件对应哪一条官方记录」和标题，不参与排序。
- 规则能唯一归属就不调模型；只有集号重复、本地集号在官方不存在、无编号文件与剩余 SP 不唯一时才返回 `resolved: false`，交由模型或人工。
- 本地缺集是正常状态（用户没下载），只记录到 `missing` 供提示，不阻断对齐。
- 测试数据不入库：用例内联构造，真实响应的回归用例从 `.cache/` 读取，文件不存在时整组跳过。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `server/src/integrations/bangumi/filenames.ts` | 新增 `parseEpisodeNumber`、`hasSpecialMarker`、`naturalCompare` | 文件名是顺序的唯一依据 |
| `server/src/integrations/bangumi/align.ts` | 新增 `collectOfficialEpisodes`、`orderLocalFiles`、`alignByRules` | 归一化官方剧集并做唯一映射 |
| `test/server/bangumi-align.test.ts` | 18 个用例，含真实响应回归 | 防止规则被「看起来更合理」的改法破坏 |

## 实现要点

1. **集号解析**按可靠性排序：`SxxEyy` → `第 N 话` → 方括号/圆括号编号 → ` - N` → 前缀编号。前缀编号允许 `-`、`.`、`_` 分隔，`00-特别篇.mp4` 才能解析为 0。分辨率、编码、音轨、四位年份、CRC 不当作集号。
2. **`collectOfficialEpisodes`** 只保留 `type 0/1`，按 `(partIndex, sort)` 排序，split cour 的两个条目按传入的 `partIndex` 拼接。`partIndex` 由调用方按首播日期排好后传入，这里不猜条目顺序。
3. **`orderLocalFiles`** 有集号的按集号升序、无集号的按自然序追加。不提供「字符串排序」分支：混排目录里 `[Studio GreenTea] ... S3 [09]` 会被排到 `01.mp4` 之前。
4. **`alignByRules`** 先按 `sort` 精确匹配正片，剩余文件再匹配特别篇（`sort` 相同，或文件名带 SP 标记且只剩一个候选）。任何一步出现歧义都返回 `resolved: false`，不做「按位置顺延」的猜测。
5. **缺集处理**：匹配不要求官方正片全部被用掉，只要求每个本地文件都有唯一归属。缺集记入 `missing`，与「按位置对齐」的区别是后续文件保留真实集号，不会整体错位。
6. **特别篇标记**只在解析不出集号时兜底。`00-特别篇.mp4` 带标记但实际是第 0 话正片，因此标记不能反向推断内容。

## 行为变化与兼容性

- 纯新增模块，未接入任何接口，不影响既有功能。
- 仓库不新增测试数据文件；真实响应回归依赖本地 `.cache/bangumi-raw/`，缺失时跳过。

## 验证

- `pnpm exec vitest run test/server/bangumi-align.test.ts`：18 个用例通过，其中 1 个为真实响应回归（本地存在 `.cache` 数据时执行）。
- 覆盖：第 0 话、方括号编号、混排排序、type=4 排除、小数 sort、缺集、重复集号、本地集号越界、SP 兜底归属。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。

## 关联文档

- `docs/modules/server/bangumi-sync.md`（编排接入时补全）
