# 详情页剧集拖拽排序

适用文件：`web/src/components/detail/DetailSeason.vue`、`web/src/data/episode.ts`。

## 1. 职责边界

- 负责：详情页季面板内**同一季**的剧集顺序调整，包含拖拽交互、季级加载态、失败回滚。
- 不负责：跨季移动剧集、服务端按文件名推导顺序、自动重排。剧集初始顺序仍由服务端 `sort` 决定（新文件追加在末尾），拖拽只覆盖用户显式调整的结果。
- 不改变播放逻辑：卡片点击仍然播放，拖拽只能从序号前的手柄发起。

## 2. 数据结构

| 层 | 持有者 | 说明 |
| --- | --- | --- |
| 服务端 | `.video.json` 中 `episodes[].sort` | 唯一持久顺序；`PUT /episode/:id/sort` 修改，区间内其余项 ±1 平移 |
| 数据层 | `Season.episodes`（`customRef`） | 通过 `setEpisodes()` 整体替换并触发依赖 |
| 组件 | `episodes: ShallowRef<Episode[]>` | 拖拽用的本地镜像，元素保持原始实例 |

两个关键选择：

1. **必须用本地镜像**。`season.episodes` 是 `customRef`，原地 `splice` 不会触发更新，模板里的“第 N 集”序号会失真；且 `web/AGENTS.md` 禁止原地修改关系数组。
2. **必须用 `shallowRef`**。`ref<Episode[]>` 会做深度解包，把领域对象推导成去掉私有字段的结构类型，`setEpisodes()` 和 `emit('play', episode)` 都会报类型错误；`shallowRef` 只跟踪数组引用，元素仍是原始实例。

## 3. 数据流

```text
props.season.episodes ──watch（原地 splice + triggerRef）──> episodes 本地镜像
        │                                        │
        │                                        ├─ 拖拽：SortableJS 移动 DOM，库内调整数组
        │                                        ▼
        │                                onEnd → triggerRef → commitSort(old, new)
        │                                        │
        │                           status.onSorting()（v-loading 覆盖季面板）
        │                                        ▼
        │                     moved.updateSort(new + 1) → 服务端区间 ±1 平移
        │                                        │
        │        成功：本地 syncSort 全部序号 + season.setEpisodes(新顺序)
        │        失败：updateSort 内部回滚 sort，组件按 onStart 快照恢复顺序
        └────────────────────────────────────────┘
```

- 只提交**被拖动的那一集**：服务端 `doUpdateEpisodeSort` 会平移区间内其他集，逐条提交会造成重复位移。
- `onStart` 记录顺序快照；`updateSort()` 返回布尔值表示成功与否，组件据此决定是否回滚。
- 成功后用 `syncSort()` 把其余集的本地 `sort` 对齐到 `index + 1`，避免字段与服务端顺序长期不一致。

## 4. 加载态

- 使用 Element Plus 的 `v-loading`，挂在季面板内容容器 `.episode-panel` 上；遮罩样式由 `web/src/assets/elements/loading.scss` 全局覆盖，组件内不写遮罩样式。
- 遮罩自身拦截指针事件，排序期间无法再次拖拽，不需要额外的禁用开关。
- 请求返回后无论成功失败都在 `finally` 中关闭加载态。

## 5. 关键约束

- `v-for` 的 `:key` 必须是 `episode.id`，否则 SortableJS 移动 DOM 后 Vue 重渲染会回弹。
- 手柄 `Rank` 图标必须阻止点击冒泡，卡片点击用于播放。
- 拖拽动画只用 SortableJS 的 `animation`；不要再给同一列表加 `<TransitionGroup>` 的 `move`，两套 FLIP 会叠加。
- 本地镜像在 `watch` 中原地替换，保持数组引用不变，避免拖拽实例持有过期数组；`shallowRef` 的原地修改必须手动 `triggerRef()`。
- 样式只保留交互必需的 `cursor` 与透明度，占位块仅半透明，遵循 `web/AGENTS.md` 的最小样式约定。

## 6. 扩展点与已知限制

- 跨季拖拽需要配置 `group` 并处理目标季的 `sort` 重排，当前未实现。
- 季面板折叠时列表仍挂载（`el-collapse-item` 用 `v-show`），拖拽实例在挂载时创建，展开后即可使用。
- 排序结果不反向影响文件名，也不会触发服务端重新扫描。

## 7. 验证方式

1. `pnpm --filter web type-check`。
2. `pnpm --filter web build` 确认模板与依赖解析正常。
3. 详情页手动验证：拖动手柄改变顺序 → 季面板出现遮罩 → 完成后序号连续，刷新页面顺序保持。
4. 失败路径：断开服务端后拖拽，确认顺序回滚且加载态关闭。
5. 回归：点击卡片仍能播放；折叠/展开季、切换季不报错；连续拖拽不产生重复 `sort`。
