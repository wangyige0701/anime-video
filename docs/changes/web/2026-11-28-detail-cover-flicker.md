# 详情页首图在成员加载完成后跳变

## 现象

调整合并组的图片顺序后，刷新详情页会看到首图「闪一下再换」：先显示主系列自己的第一张，成员数据到达后立刻切成拖拽后的那张（可能属于成员系列）。

## 原因

主系列和合并成员是两次请求，`onMounted` 里先 `series.value = info`，再 `await loadMembers(info)`：

```ts
const info = await useVideoStore().getSeriesDetail(seriesId);
series.value = info; // 此刻 memberGroups 还是空的，页面已经渲染过一帧
await loadMembers(info); // 成员到达，displayImages 重算 → 首图变化
```

中间那一帧 `displayImages` 只拿得到主系列的图片。`orderMergedImages()` 会丢弃顺序表里找不到对应图片的路径，于是算出的首图退回主系列第一张；成员到达后顺序补齐，首图又变回正确的那张——视觉上就是跳变。

顺序本身没有错，错在「用不完整的数据算了一次」。

## 改动

新增 `orderDisplayImages(mainImages, memberImages, order, pending)`（`web/src/utils/seriesMerge.ts`）：

- `pending`（有合并成员但数据未就位）时：有 `mergedImageOrder` 就用它——它是保存时服务端返回的完整顺序，首帧即正确；没有显式顺序则用主系列图片（此时主系列首图本来就是整组首图）。
- 非 `pending` 时走原来的 `orderMergedImages()`，结果不变。
- 返回副本，不与记录共用数组。

详情页用 `membersReady` 标志驱动：`loadMembers()` 进入时按 `mergedIds` 是否为空置位，结束后无论成功失败都置为已就位（失败时若一直停在占位顺序，反而看不到成员的真实图片）。

## 边界

- 占位顺序可能包含磁盘上已删除的图片路径（`mergedImageOrder` 只在脱离合并时清理，不跟随磁盘删除），极短窗口内可能出现一次加载失败，成员到达后自动过滤。
- 季列表同样分两批到达，但成员季是追加在末尾，主系列季位置不变，不产生跳变，因此未改动。

## 验证

- `test/web/series-merge.test.ts`：30 例通过，新增 5 例覆盖「成员未就位有显式顺序」「未就位无显式顺序」「返回副本」「无合并」。
- `pnpm --filter web type-check`、`check-vue-tags`、`check-undefined` 通过；全量 `pnpm exec vitest run` 49 文件 513 例通过。
- 手工验证方式：详情页把成员图片拖到第一位并保存 → 强刷详情页（Ctrl+F5），首图应始终是拖拽后的那张，不再先闪主系列图；网络限速下更明显。
