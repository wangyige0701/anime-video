# 回到首页时重算列表与时间轴

- 日期：2026-11-28
- 模块：web
- 类型：修复

## 现象

在详情页设置系列的上线时间（或改类型、状态）后回到首页，时间轴的刻度与选中位置没有更新，卡片仍停在改动前的分组与顺序上；浏览器历史返回同样如此。用户估计标签筛选也会一样。

## 原因

首页被 `App.vue` 的 `<keep-alive :include="[INDEX]">` 缓存，返回时只触发 `activated`，不会重跑 `onMounted`：

- `IndexList.vue` 的 `datas` 是加载时由 `paginateSeries()` 截取的**一次性结果**，顺序、过滤结果与分页都在那时算完；
- `IndexFilterDate.vue` 的 `axis` 只在挂载与 `refreshEmitter` 的 `series` 事件（全量刷新、合并、脱离）时重建。

详情页的改动写在同一个缓存的 `Series` 实例上，字段本身是响应式的，因此卡片内部能更新，但「谁该出现在第几页、属于哪个月」这类派生结果不会重算。标签筛选与时间筛选都走同一条列表管线，所以是一处根因。

## 修复

1. `utils/seriesQuery.ts` 新增纯函数 `buildIndexPage(all, keyword, query, page, pageSize)`：**剔除合并成员 → 过滤排序 → 截取前 `page * pageSize` 条**，返回 `{ items, total }`。它把原先内联在刷新处理器里的三步合成唯一实现。
2. `IndexList.vue` 的 `refreshEmitter` 处理器改为调用 `buildIndexPage()`，行为不变。
3. `IndexList.vue` 新增 `onActivated`：非首次激活时 `refreshEmitter.emit('series', await Series.getAllSeries())`，复用同一套刷新管线。不发网络请求，只读数据层缓存。

时间轴不需要改：它的刻度重建与窗口收敛本来就订阅同一个 `series` 事件，并 `watch(() => props.axis)` 重置可见窗口。一份快照同时喂给列表与轴，不会出现「列表变了、轴还是旧的」。

## 关键约束

- **首次挂载不重复刷新**：keep-alive 组件首次挂载也会触发 `activated`，用 `activatedOnce` 放行第一次，避免与 `load(true)` 并发重复计算。
- **搜索页不受影响**：`IndexList` 也被搜索页复用，但搜索页不在 keep-alive 的 `include` 里，`onActivated` 不会触发。
- **不新增网络请求**：回到首页只读缓存。真正的磁盘对账仍由「刷新」按钮触发的 `refreshSeries()` 负责。

## 验证

- `pnpm --filter web type-check` 通过。
- `pnpm exec vitest run test/web/series-query.test.ts`：新增 5 例覆盖正常截取、多页保留、合并成员剔除、改动后立即参与排序与过滤、空数据与非法页码。
- 手工验证：详情页设置上线时间 → 返回首页，时间轴出现该月刻度、卡片落入对应月份分组；浏览器后退同样生效；合并成员不会因回到首页重新出现在列表里。
