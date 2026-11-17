# 详情页季拖拽排序

适用文件：`web/src/views/[seriesId]/[name].vue`、`web/src/components/detail/DetailSeason.vue`、`web/src/data/season.ts`。

季拖拽与剧集拖拽共用同一套机制（本地镜像、单条提交、失败回滚、Element Plus 加载态），通用结论见 [detail-episode-sort.md](detail-episode-sort.md)。本文只记录季层与集层的差异，避免两份文档重复维护同一段细节。

## 1. 职责边界

- 负责：详情页**同一系列内**季的显示顺序调整，包含拖拽交互、列表级加载态、失败回滚。
- 不负责：跨系列移动季、把季顺序写回磁盘目录名、触发服务端重新扫描。
- 不改变折叠逻辑：季的展开/收起仍由 `el-collapse` 的 `accordion` 管理，拖拽只能从标题前的季手柄发起。

## 2. 与集层的差异

| 维度 | 剧集（季面板内） | 季（详情页列表） |
| --- | --- | --- |
| 数据源 | `season.episodes`（`customRef`） | `series.seasons`（`customRef`） |
| 回写方法 | `season.setEpisodes()` | `series.setSeasons()` |
| 拖拽容器 | `.episodes` 网格（`div`，模板 ref 直接是元素） | `.el-collapse` 根元素（组件实例，需取 `$el`） |
| 手柄类名 | `.drag-handle` | `.season-handle` |
| 加载态挂载点 | 季面板内容 `.episode-panel` | 整个季列表 `.list` |
| 序号展示 | 卡片内的“第 N 集” | 无序号，顺序即语义 |

**手柄类名必须区分**：季的拖拽容器包含集面板，若两级共用一个类名，抓集手柄会误触发季拖拽。

## 3. 数据流

```text
series.seasons ──watch（原地 splice + triggerRef）──> seasons 本地镜像（shallowRef）
        │                                        │
        │                                        ├─ 拖拽：SortableJS 移动 .el-collapse-item
        │                                        ▼
        │                                onEnd → triggerRef → commitSeasonSort(old, new)
        │                                        │
        │                           status.onSorting()（v-loading 覆盖整个季列表）
        │                                        ▼
        │                     moved.updateSort(new + 1) → 服务端区间 ±1 平移
        │                                        │
        │        成功：syncSort 全部序号 + series.setSeasons(新顺序)
        │        失败：updateSort 内部回滚 sort，组件按 onStart 快照恢复顺序
        └────────────────────────────────────────┘
```

- 服务端 `Series.doUpdateSeasonSort` 与剧集同构：只接收“移动到第 N 位”，按当前 `sort` 推导顺序、移动目标季、全量重编号 1..n，并原地重排缓存数组。重编号一步修掉了历史 `sort` 空洞，也避免“新位置恰好等于旧 `sort`”时请求空转。
- **必须重排缓存数组**：`Series._seasons` 是初始化时排序一次的数组，只改 `sort` 不重排会让接口继续返回旧顺序，刷新后表现为“排序没保存”。
- `onSorting()` 挂在详情页的 `status`（`useVueStatusRef('waiting', 'sorting')`）上，与页面等待态共用一个实例。

## 4. 关键约束

- 拖拽元素的 `:key` 必须是 `season.id`；`DetailSeason` 的根节点就是 `el-collapse-item`，`v-for` 外层用 `<template>` 包裹，不能再套一层 `div`，否则 SortableJS 的容器子节点与数据下标会错位。
- `useDraggable` 的第一个参数必须是**真实 DOM 元素**。`el-collapse` 的模板 ref 是组件实例，需传 `computed(() => listRef.value?.$el)`；库内部对非 HTMLElement 值会取 `$el`，但类型层面不能直接传组件实例。
- 手柄必须 `@click.stop`，否则点击手柄会冒泡到折叠面板头部，触发展开/收起。
- 列表间距使用 `gap` 而不是 `:not(:last-child)` 的 `margin`：拖拽重排时“最后一个元素”会变，margin 方案会让整列产生跳动。
- 加载遮罩由 `v-loading` 注入到 `.el-collapse` 内部，它同样是容器的子节点，但不带手柄类名，不会成为可拖拽项；遮罩本身拦截指针事件，排序期间无法再次发起拖拽。

## 5. 扩展点与已知限制

- 展开状态的季被拖动时，整块内容（含已展开的集面板）一起移动，这是 SortableJS 的默认行为，未做高度收拢。
- 季顺序不会写回目录名，也不会改变服务端扫描顺序；刷新页面后以 `sort` 字段为准。
- 跨系列拖拽需要配置 `group` 并处理两个系列的 `sort` 重排，当前未实现。

## 6. 验证方式

1. `pnpm --filter web type-check`、`pnpm --filter web build`。
2. 详情页手动验证：拖动季标题前的手柄 → 整个季列表出现遮罩 → 完成后顺序保持，刷新页面顺序不变。
3. 失败路径：断开服务端后拖动，确认顺序回滚、遮罩关闭。
4. 回归：点击季标题仍能展开/收起；季内剧集拖拽不受影响；连续拖动多季不产生重复 `sort`。
