# 合并系列支持跨系列季排序与图片排序交互

- 日期：2026-11-28
- 模块：web
- 类型：功能

## 背景

合并后的详情页把成员的季拼在主系列后面展示，但季标题前的拖拽手柄被隐藏了：季排序接口的语义是「在所属系列内移动到第 N 位」，跨系列位置无法表达。图片虽然也按合并关系拼接展示，却完全没有调整顺序的入口。

服务端补齐了合并组的顺序字段与端点（见 [2026-11-28-merge-group-order](../server/2026-11-28-merge-group-order.md)），前端这一批把两处交互接上。

## 季：跨系列拖拽

`views/[seriesId]/[name].vue` 的 `commitSeasonSort()` 按是否合并分流：

| 场景   | 提交内容                                    | 接口                                 |
| ------ | ------------------------------------------- | ------------------------------------ |
| 单系列 | 被拖动的那一季 + 目标位置（`newIndex + 1`） | `PUT /data/season/:seasonId/sort`    |
| 合并组 | **完整顺序**（季 id 数组）                  | `PUT /data/series/:id/merge/seasons` |

单系列继续沿用「移动到第 N 位」，行为与之前完全一致；合并组提交整份顺序，由服务端把各系列自己的 `sort` 重编为子序。

拖拽结束后还要把顺序拆回各系列（`syncGroupSeasons()`）：按扁平列表算出每个季在自己系列里的序号调用 `syncSort()`，再用 `setSeasons()` 更新主系列与每个成员的季数组。不做这一步，界面顺序正确但成员实例仍持有旧数组，脱离合并后打开成员的详情页会看到旧顺序。

`DetailSeason` 的 `sortable` 属性随之删除——它存在的唯一理由就是这条限制。

## 图片：排序面板

海报右上角新增排序入口（多图时才出现，`stop` 掉 click 以免触发大图预览），点击打开 `components/detail/DetailImageManage.vue`：

- 缩略图网格，拖拽调整顺序，右下角标序号；
- 页脚只有「取消 / 保存」，保存期间 `unclosable()`；
- 面板只做拖拽与保存，写入通过 `commit` 回调交给详情页：面板挂在独立的应用里，拿不到详情页的 provide，合并组与非合并组的差异（提交哪个接口）也不该由面板判断。

详情页的 `commitImageOrder()` 同样按是否合并分流：合并组走 `PUT /data/series/:id/merge/images`（绝对路径数组），单系列走既有的 `PUT /data/series/:id/images/set`。成功后 `syncGroupImages()` 把全局顺序拆回主系列与成员，保证脱离后各自仍是合并时看到的子序。

`displayImages` 从「主系列在前 + 成员追加 + 去重」改为同一套链路再应用 `mergedImageOrder`，去重与排序都由 `orderMergedImages()` 完成。

## 纯逻辑

`utils/seriesMerge.ts` 新增两个纯函数，用例在 `test/web/series-merge.test.ts`：

- `orderMergedSeasons(mainSeasons, memberSeasons, order)`：默认顺序 + 显式顺序；
- `orderMergedImages(mainImages, memberImages, order)`：同上，键为绝对路径。

两者都直接复用 `shared/series-order.ts` 的 `applyExplicitOrder()`——与服务端落库是同一份实现，否则刷新后顺序可能变化。

## 验证

- `pnpm --filter web type-check`、`pnpm --filter web build`、`node scripts/check-vue-tags.mjs` 通过。
- `pnpm exec vitest run`：47 文件 / 482 例通过（含新增 7 例合并组顺序、7 例显式顺序）。
- 手工验证（已执行）：
    1. 主系列 2 季 + 成员 1 季，把成员季拖到最前 → 顺序保持，刷新后仍是该顺序；
    2. 拖拽后点卡片角标「脱离」，进入成员详情页：季顺序等于它在合并视图里的顺序，`sort` 从 1 连续排列；
    3. 打开图片面板把成员图片拖到首位 → 保存后海报轮播顺序变化，刷新后保持；脱离后主系列与成员各自的图片顺序都等于合并时的子序；
    4. 单系列（未合并）拖季与拖图：行为与改动前一致。
- 失败路径：断开服务端后拖季，遮罩关闭、顺序回到拖拽前；图片面板保存失败时保持打开并由 API 拦截器提示原因。

## 已知限制

- 合并组的图片排序只在主系列记录显式顺序；成员自己单独打开时按服务端重写后的 `sort` 展示，与合并视图的子序一致，但不会保留「跨系列交错」的信息（跨系列顺序本来就不属于单系列）。
- 季拖拽仍是「整块移动」：展开状态的季被拖动时，已展开的集面板一起移动。
