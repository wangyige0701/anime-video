# 详情页改图片顺序后首页封面不更新

## 现象

在详情页调整图片顺序并保存，回到首页卡片仍是旧封面／旧叠层，刷新浏览器后才变成新的。

## 排查结论

先验证响应式链路本身：用真实 `Series` 实例写探针，`computed(() => getMergeCovers(...))` 在 `mergedImageOrder` 与成员 `images` 变化后都立即重算（探针已删除，结论保留）。所以**计算与响应式没问题**，缺的是「通知首页重算」。

首页的形态决定了它不会自己重算：

- `IndexList` 的 `datas` 是 `shallowReactive`，元素是 `Series` 实例，`segments` 只依赖数组结构；
- 卡片按 `series.id` 作 key 复用组件，`props.series` 引用不变时父级不会重新传参；
- 合并、脱离本来就走 `refreshEmitter` 广播全量快照，**图片顺序这条写入路径漏了广播**。

开发态还有一个叠加因素：模块热替换会让首页组件与详情页组件各自持有自己的 `Series` 缓存，两边的实例不再共享，单靠实例字段的响应式无法穿透。

## 改动

`web/src/views/[seriesId]/[name].vue` 的 `commitImageOrder()` 成功后广播一次：

```ts
if (success) {
	refreshEmitter.emit('series', await Series.getAllSeries());
}
```

为什么用广播而不是就地改本地状态：

- 广播传的是**同源快照**，首页的 `allSeries` 与 `datas` 都换成这份数据，两条链路（封面与叠层）同时收敛；
- 不依赖首页与详情页共享同一实例，模块热替换导致的缓存分裂也能自愈；
- 与合并、脱离复用同一条管线，不需要为「图片变了」单独写一套刷新逻辑。

## 验证

- 全量 `pnpm exec vitest run` 连续两次 49 文件 514 例通过；`web type-check`、`build`、`check-vue-tags` 通过，构建产物不含 CSRF meta（发布态由服务端注入，符合预期）。
- 手工验证：详情页调整图片顺序保存 → 直接返回首页（含浏览器历史返回），卡片封面与叠层立即更新，不需要刷新页面；在开发服务器上连续改多次也应即时生效。
