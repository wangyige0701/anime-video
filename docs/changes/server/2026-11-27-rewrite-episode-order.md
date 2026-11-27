# 新增按 id 数组整体重写剧集排序的方法

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server

## 背景

Bangumi 同步预研（`.cache/bangumi-wushoku.mjs`）确认了双方的 `sort` 语义完全不同：

- **Bangumi**：`episode.sort` 是播出顺序号，本篇跨条目连续（第一季 1..23），可以是 `0`（第 0 话）或小数（`18.5`，插在两集之间的特别篇）。
- **项目内**：`Season → Episode` 的 `sort` 是 `1..N` 的连续顺序号，只表达「第几个播放」，不承载「第几集」。

现有入口都不适用：

- `Episode.updateSort(position)` 的语义是「移动到第 N 位」，参数被 `Math.max(1, ...)` 钳制，逐集调用会互相覆盖、产生中间态，且第 0 话会被顶成第 1 位。
- `Episode.rewriteSort(sort)` 是内部方法，直接写字段，不做重编号、不同步内存数组，外部调用会制造空洞或重复。

同步场景需要的是「我有完整顺序，帮我一次性覆盖」，因此补一个整体重写入入口。

## 目标与取舍

- 入参是**有序的集 id 数组**，不是位置、不是集号；顺序即最终顺序。
- 内部统一 `rewriteSort(index + 1)` 重编号，并 `splice` 原地重排缓存数组，保证 `GET` 立即返回新顺序。
- 与拖拽排序共用同一个 `episodeSortQueue`，避免两种写法交叉执行时互相覆盖。
- **校验全部前置**：重复 id、不属于本季的 id 直接抛错，整次不落盘，不做部分写入。
- **未列出的集追加在末尾**，保持原有相对顺序。宁可排在后面，也不因为调用方漏传而从顺序里消失（漏传的集仍然可以在预览里被发现）。
- 不提供「允许跳号」的选项：项目内 `sort` 就是连续序号，缺集由「该位置没有文件」体现，不在 `sort` 上留洞。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `server/data/season.ts` | 新增 `rewriteEpisodeOrder(ids)` 与私有 `doRewriteEpisodeOrder(ids)` | 提供整体覆盖顺序的入口 |
| `server/test/video.test.ts` | 夹具新增 `3.mp4`；补测整体重写、未列出集追加、重复 id、越界 id、非法入参不落盘 | 覆盖正常路径与边界 |
| `server/AGENTS.md` | 「排序与并发更新」补充内部 `sort` 语义与整体重写约定 | 防止外部数据源直接写集号 |

## 实现要点

1. 入口只做队列编排：

   ```ts
   public async rewriteEpisodeOrder(ids: string[]) {
       const task = this.episodeSortQueue.then(() => this.doRewriteEpisodeOrder(ids));
       this.episodeSortQueue = task.then(() => {}, () => {});
       return await task;
   }
   ```

   队列只关心「上一个任务结束」，失败不能中断后续任务，也不能把 `Episode[]` 塞进 `Promise<void>` 队列类型。

2. 私有实现先按当前 `sort` 推导有序数组，用 `Map<id, entry>` 做查找；按 `ids` 顺序取项，标记重复与越界；再把未命中的项按原有相对顺序追加。

3. 全部校验通过后才进入写循环，逐个 `rewriteSort(index + 1)`。`rewriteSort` 走 `Entity.write()`，会删除字段缓存，`Data` 的 `set` 拦截标脏并按 `dataFileSaveDelay` 合并写盘。

4. 最后 `episodes.splice(0, episodes.length, ...ordered)` 原地重排 —— 与 `doUpdateEpisodeSort` 同一写法，`Season.episodes` 的 Promise 引用不变，`getValue()` 与 `getSeasonById` 等读取路径无需改动。

5. 无剧集时直接返回，不做 id 校验（空季不可能有合法 id）。

## 行为变化与兼容性

- 纯新增方法，既有 `updateSort` / `rewriteSort` 行为不变，拖拽排序不受影响。
- `sort` 语义未变，仍是 1..N 连续序号，无需数据迁移。
- 抛错信息包含季目录名与集 id，便于控制器层转成 400。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run`：21 个文件 198 个用例全部通过。
- 新增用例断言：
  - `rewriteEpisodeOrder([3, 1])` 后 `3.mp4=1`、`1.mp4=2`、`2.mp4=3`，内存数组顺序与之一致，落库 `sort` 与 `path` 对应关系正确；
  - 重复 id 抛 `/重复/`、未知 id 抛 `/不属于/`，且抛错后三个集的 `sort` 保持原值（证明校验前置）；
  - 恢复为 `[1, 2, 3]` 后 `sort` 与文件名顺序一致。

## 关联文档

- `server/AGENTS.md`（排序与并发更新）
- 相关历史记录：`docs/changes/server/2026-11-17-sort-order-cache-sync.md`
