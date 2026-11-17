# 修复季/集排序写入后接口顺序滞后与二次拖拽空转

- 日期：2026-11-17
- 模块：server
- 类型：修复
- 涉及模块：server、web（仅验证与文档，无代码改动）

## 背景

详情页拖拽排序上线后，用户反馈“前端顺序变了，存储没更新”。服务端日志显示两次 `PUT /data/season/:seasonId/sort` 都返回 200 且 `season.sort.updated` 有记录，但配置文件里的 `sort` 没有变化。

用独立片库复现后确认是两个叠加的问题：

1. **接口顺序滞后**：`Series._seasons` 与 `Season._episodes` 都是初始化时排序一次的数组（`Season.getAllSeasons` / `Episode.getAllEpisodes`），`rewriteSort` 只改 `sort` 值，不重排数组。所以写入成功后，`GET /data/seasons/:seriesId` 仍按旧数组顺序返回，刷新页面就“回到原样”。
2. **二次拖拽空转**：由于刷新后前端拿到的是旧顺序，而 `sort` 已是新值，再次拖拽时算出的目标位置恰好等于目标项的当前 `sort`，旧实现 `if (oldSort === newSort) return` 直接返回，接口 200 但什么都没写。

另外旧实现只对区间内其它项做 ±1 平移，历史数据中的 `sort` 空洞（此前排查发现 6 个季存在空洞）会让平移结果不连续。

## 目标与取舍

- 排序结果必须以“位置”为准：客户端说“移动到第 N 位”，服务端就按位置重排，不依赖新旧 `sort` 的差值。
- 写入后接口必须立即返回新顺序，刷新页面顺序保持。
- 顺带把 `sort` 规整为连续的 1..n，消除空洞与重复。

方案取舍：

- **不做“只改受影响的区间”优化**：全量重编号会改动整季/整系列的 `sort`，但都落在同一个 `Data` 实例上，由防抖合并成一次写盘；换来的是顺序永远自洽，且不依赖历史数据质量。
- **不改前端提交协议**：仍然是 `PUT .../sort { sort: N }`，`N` 语义变为“目标位置”，接口保持兼容。
- **原地重排缓存数组**：不改动 `_seasons` / `_episodes` 的 Promise 结构，避免影响 `getValue()`、`getSeasonById` 等既有读取路径。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `server/data/series.ts` | `updateSeasonSort` 改为传入目标季实例；`doUpdateSeasonSort` 重写为“推导顺序 → 移动 → 重编号 → 原地重排缓存数组” | 修复季排序滞后与空转 |
| `server/data/season.ts` | `updateSort` 传 `() => this`；`updateEpisodeSort` 同构重写 | 修复剧集排序滞后与空转 |
| `server/data/episode.ts` | `updateSort` 传 `() => this` | 配合新的位置参数签名 |
| `docs/modules/web/detail-season-sort.md` | 更新服务端重排与缓存一致性结论 | 模块文档描述现状 |
| `docs/modules/web/detail-episode-sort.md` | 同步剧集层结论 | 同上 |

## 实现要点

1. **位置语义**：`doUpdateSeasonSort(target, position)` 先 `Promise.all` 取所有 `sort` 并按升序排出 `ordered`，`current = ordered.indexOf(target)`，`next = clamp(position, 1, n) - 1`，`current === next` 才真正返回。
2. **重编号**：`ordered` 移动完成后逐项 `rewriteSort(index + 1)`；`rewriteSort` 写的是配置代理对象，`Data` 的 `set` 拦截会标脏并按 `dataFileSaveDelay` 合并写盘。
3. **缓存同步**：`seasons.splice(0, seasons.length, ...ordered)` / `episodes.splice(...)` 原地重排，保证 `GET` 立即反映新顺序。
4. **并发**：目标实例在排序队列内解析（`getTarget: () => Season | Promise<Season>`），连续拖拽按队列顺序依次应用，不会用过期位置互相覆盖。
5. `Episode.updateSort` 之后保留 `this.registerSort()`，让集自身的 `sort` Promise 立即更新。

## 行为变化与兼容性

- `sort` 语义从“参与区间平移的绝对值”变为“目标位置”，并统一重编号 1..n；旧配置无需迁移，下一次拖拽即自动规整。
- 单次拖拽会写多个 `sort`（整季/整系列），但合并为一次落盘，`waitDataSave` 语义不变。
- 接口路径、请求体、返回结构均未变化。
- 顺带修掉了历史数据中的 `sort` 空洞与重复：排序后再读取，`sort` 一定是 1..n 连续值。

## 验证

- `pnpm exec tsc --noEmit -p server/tsconfig.json`：改动文件无类型错误（仓库内有两处 `node_modules` 类型定义的既有报错，与本次无关）。
- `server/test/video.test.ts` 无法运行：根 Vitest 配置未注入 `__APP_CONFIG__` 全局，`git stash` 后表现一致，属既有问题。
- **独立片库端到端验证**（临时数据目录 + 无头 Chrome 真实鼠标拖拽）：
  - 季：初始 `1:第1季 2:第2季 3:第3季` → 拖第 3 季到首位 → DOM、接口、磁盘三者均为 `1:第3季 2:第1季 3:第2季`；刷新页面顺序保持；再把首位拖到末尾，三者仍一致。
  - 集：5 集网格中把第 5 集拖到首位 → DOM、接口、磁盘均为 `1:5 2:1 3:2 4:3 5:4`；刷新后保持。
- 未在真实片库上执行拖拽，避免改动用户数据。

## 关联文档

- `docs/modules/web/detail-season-sort.md`
- `docs/modules/web/detail-episode-sort.md`
- 相关历史记录：`docs/changes/web/2026-11-17-season-drag-sort.md`、`docs/changes/web/2026-11-17-episode-drag-sort.md`
