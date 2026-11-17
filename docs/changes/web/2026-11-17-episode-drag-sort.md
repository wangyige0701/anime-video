# 详情页剧集支持拖拽排序并显示季级加载状态

- 日期：2026-11-17
- 模块：web
- 类型：功能

## 背景

详情页季面板中的剧集按服务端 `sort` 字段排列，而 `sort` 由扫描顺序推导：新文件一律 `max + 1` 追加，重下或改名过的文件（ID 变化）会落到末尾。因此实际显示顺序常常是“下载顺序”而不是文件名顺序。

上一轮排查确认不应在服务端改扫描规则（会覆盖用户手动调整的结果），改为让用户在详情页直接拖拽调整，并把顺序落库到 `sort`。

## 目标与取舍

- 在季面板内拖拽调整剧集顺序，松手后立即提交服务端。
- 提交期间在季容器显示 Element Plus 的加载态，避免重复操作与状态错乱。
- 保持卡片点击播放不变，拖拽只能从手柄发起。

方案取舍：

- **选用 `vue-draggable-plus`**：基于 SortableJS，支持网格布局、触屏、任意容器指定，`animation` 自带位移动画；同类中 `vuedraggable@4` 已停更，`@formkit/drag-and-drop` 生态更年轻。
- **不直接把手写数组交给拖拽库**：`season.episodes` 是 `customRef`，原地修改不触发更新，必须走本地镜像 + `setEpisodes()` 回写。
- **只提交被拖动的那一集**：服务端接口语义是“移动到第 N 位，区间内其它集 ±1”，逐条提交会重复位移。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `web/package.json` | 新增依赖 `vue-draggable-plus@^0.6.1` | 拖拽排序实现 |
| `pnpm-lock.yaml` | 由 `pnpm --filter web add` 生成 | 锁定依赖与 peer |
| `web/src/components/detail/DetailSeason.vue` | 新增本地镜像、拖拽实例、提交与回滚、`v-loading` 面板、手柄与占位样式 | 功能主体 |
| `web/src/data/episode.ts` | `updateSort()` 返回布尔值；新增 `syncSort()` | 失败可判断、成功后可对齐本地序号 |
| `web/AGENTS.md` | 补充拖拽排序对 `updateSort`/`syncSort` 的调用约定 | 避免后续改动绕过成功判定或重复提交 |
| `docs/modules/web/detail-episode-sort.md` | 新增模块文档 | 记录状态流、约束与验证方式 |

## 实现要点

1. **本地镜像**：`episodes = shallowRef<Episode[]>([])`，在 `watch(() => props.season.episodes)` 中原地 `splice` 后 `triggerRef()`。
   - 用 `shallowRef` 而非 `ref`：`ref` 的 `UnwrapRef` 会把 `Episode` 推导成缺少私有字段的结构类型，`setEpisodes()` 与 `emit('play', episode)` 直接编译报错。
2. **拖拽配置**：`animation: 180`、`handle: '.drag-handle'`、`ghostClass: 'episode-ghost'`；`onStart` 保存顺序快照，`onEnd` 先 `triggerRef()` 再提交。
3. **提交**：`moved.updateSort(newIndex + 1)`；成功则 `episodes.forEach((e, i) => e.syncSort(i + 1))` 并用 `season.setEpisodes()` 回写关系；失败则按快照恢复本地顺序。
4. **加载态**：`status = useVueStatusRef('sorting')`，模板 `<div class="episode-panel" v-loading="status.sorting">`，`finally` 中关闭；遮罩自身拦截指针事件，无需额外禁用。
5. **播放隔离**：手柄图标 `@click.stop`，拖动结束不会触发卡片播放。

## 行为变化与兼容性

- 详情页季面板新增可拖拽手柄（序号前的 `Rank` 图标），卡片其余区域行为不变。
- 排序结果写入对应剧集的 `sort`，其余集由服务端平移；本地 `sort` 与服务端保持一致。
- 未改动任何服务端接口、扫描规则或持久化结构；旧 `.video.json` 无需迁移。
- 新增前端依赖，需重新 `pnpm install`。

## 验证

- `pnpm --filter web type-check` 通过。
- `pnpm --filter web build` 通过（含 `vue-tsc` 与 Vite 生产构建）。
- `pnpm exec oxfmt` 已格式化改动文件。
- **未执行**真实拖拽落库：本地启动的开发服务读取的是真实片库配置，拖动会改写 `.video.json` 的 `sort`，避免在未确认时改动用户数据。拖动后的加载态、失败回滚与刷新保持需在人工验收时确认。

## 关联文档

- `docs/modules/web/detail-episode-sort.md`
- `web/AGENTS.md`：`## 系列、季、集数据方案` → 字段更新与请求状态
- 相关历史记录：`docs/changes/shared/2026-11-17-docs-convention.md`、`docs/changes/web/2026-11-17-minimal-style-rule.md`
