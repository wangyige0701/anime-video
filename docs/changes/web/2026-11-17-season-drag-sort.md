# 详情页季支持拖拽排序

- 日期：2026-11-17
- 模块：web
- 类型：功能

## 背景

详情页顶部的季列表按服务端 `sort` 排序，`sort` 由扫描顺序推导：新季一律 `max + 1` 追加，目录改名或被重扫后新建的季会落到末尾。剧集层已支持拖拽排序，季层同样需要让用户直接调整，否则顺序不正确时只能改配置文件。

## 目标与取舍

- 在详情页季列表内拖拽调整季顺序，松手后立即提交服务端。
- 提交期间在整个季列表显示 Element Plus 加载态，阻止重复拖拽。
- 保持点击标题展开/收起的行为，拖拽只能从标题前的季手柄发起。

方案取舍：

- **复用剧集层的实现范式**：本地镜像 + 单条提交 + 快照回滚 + 加载态，不引入第二套机制，只按容器差异调整挂载点。
- **季手柄使用独立类名 `.season-handle`**：季的拖拽容器包含集面板，若与集的 `.drag-handle` 共用类名，抓集手柄会误触发季拖拽。
- **不重排服务端已有数据**：拖拽只落库用户显式调整的结果，不改变扫描规则。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `web/src/data/season.ts` | `updateSort()` 返回布尔值；新增 `syncSort()` | 失败可判断、成功后可对齐本地 sort |
| `web/src/views/[seriesId]/[name].vue` | 季列表改用本地镜像渲染；接入 `useDraggable`；`v-loading` 挂到 `.list`；新增 `commitSeasonSort`；`.list` 间距改为 `gap` | 功能主体 |
| `web/src/components/detail/DetailSeason.vue` | 标题前新增 `Rank` 季手柄（`@click.stop`）；手柄样式与集手柄合并 | 提供拖拽入口且不误触折叠 |
| `web/AGENTS.md` | 拖拽排序约定改为同时覆盖季与集 | 避免后续改动只按集层的结论处理 |
| `docs/modules/web/detail-season-sort.md` | 新增模块文档 | 记录与集层的差异、约束与验证方式 |
| `docs/modules/README.md` | 模块地图补充季拖拽文档 | 保持索引可发现 |

## 实现要点

1. **本地镜像**：`seasons = shallowRef<Season[]>([])`，`watch(() => series.value.seasons)` 中原地 `splice` 后 `triggerRef()`；用 `shallowRef` 避免 `UnwrapRef` 剥掉领域对象的私有字段。
2. **容器解析**：`el-collapse` 的模板 ref 是组件实例，`useDraggable` 传 `computed(() => listRef.value?.$el as HTMLElement | undefined)`。
3. **拖拽配置**：`animation: 180`、`handle: '.season-handle'`、`ghostClass: 'season-ghost'`；`onStart` 存快照，`onEnd` 先 `triggerRef()` 再提交。
4. **提交**：`moved.updateSort(newIndex + 1)`；成功则 `seasons.forEach((s, i) => s.syncSort(i + 1))` 并用 `series.setSeasons()` 回写关系；失败则按快照恢复本地顺序。
5. **加载态**：详情页 `status` 扩展为 `useVueStatusRef('waiting', 'sorting')`，模板 `<el-collapse v-loading="status.sorting">`，`finally` 中关闭。
6. **间距抗抖动**：`.list` 由 `:not(:last-child)` 的 `margin-bottom` 改为 `display: flex; flex-direction: column; gap: 20px`，避免拖拽重排时末尾元素变化引起列表跳动。

## 行为变化与兼容性

- 详情页每个季标题前新增可拖拽手柄（`Rank` 图标），其余区域行为不变。
- 排序结果写入对应季的 `sort`，其余季由服务端平移；本地 `sort` 与服务端保持一致。
- 未改动服务端接口、扫描规则与持久化结构，旧 `.video.json` 无需迁移。
- 未新增依赖，`vue-draggable-plus` 复用上一功能的安装。

## 验证

- `pnpm --filter web type-check` 通过。
- `pnpm --filter web build` 通过（含 `vue-tsc` 与 Vite 生产构建）。
- `pnpm exec oxfmt` 已格式化改动文件。
- **未执行**真实拖拽落库：本地开发服务读取真实片库配置，拖动会改写 `.video.json` 的 `sort`，需人工验收加载态、失败回滚与刷新后顺序保持。

## 关联文档

- `docs/modules/web/detail-season-sort.md`
- `docs/modules/web/detail-episode-sort.md`：季层沿用的通用机制
- `web/AGENTS.md`：`## 系列、季、集数据方案` → 字段更新与请求状态
