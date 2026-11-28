# 列表页封面跟随合并组的最终图片顺序

## 背景

合并系列支持跨系列图片排序后，详情页顺序正确，但首页/搜索页的卡片仍显示主系列自己的第一张：封面与叠层都直接取各自 `images[0]`，没有应用主系列的 `mergedImageOrder`。

用户把成员图片拖到最前面时，整组首图已经属于成员系列，列表页却毫无变化——看起来像「排序没保存」。

## 改动

- `web/src/utils/seriesMerge.ts`：`getMergeStack()` 换成 `getMergeCovers(main, members)`：
    - `cover`：整组（主系列 + 全部成员）在最终顺序里的第一张，可能属于任何一个成员；
    - `covers`：成员 id → 该系列在最终顺序里的首图，无图为空串；
    - 内部仍走 `orderMergedImages()`，与服务端落库规则同源，避免两端算出不同顺序。
- `web/src/components/index/SeriesCard.vue`：封面、叠层、成员面板缩略图三处统一用该返回值；叠层仍只取前 `MERGE_STACK_LIMIT` 层，角标数字不受限制。
- `web/src/components/index/IndexList.vue`：拖拽浮层的海报改用同一个 `coverOf()`，否则浮层与卡片会显示两张不同的图。

## 不变式

- 没有合并时 `getMergeCovers()` 等价于「取自己的第一张」，普通卡片行为不变。
- 没有显式顺序时结果与原实现一致，不需要数据迁移。
- 列表与详情共用同一批 `Series` 实例（`Series.cache`），`mergedImageOrder` 与 `images` 都是 `ref`；保存后回到列表即为新封面，不需要额外的刷新事件或接口。

## 验证

- `pnpm exec vitest run test/web/series-merge.test.ts`：25 例通过，其中新增 5 例覆盖「成员图排首位时封面跟着换」「失效路径被跳过」「成员无图」「无合并退化」。
- `pnpm --filter web type-check`、`check-vue-tags`、`check-undefined` 通过；全量 `pnpm exec vitest run` 49 文件 508 例通过。
- 手工验证方式（本次未在浏览器实测，逻辑由用例覆盖）：详情页把成员图片拖到第一位 → 返回首页，卡片封面与第一层叠图应同为新图；单系列调整图片顺序后封面同步更新。
