# 详情页季/集标题支持编辑并将描述编辑入口移到标题旁

- 日期：2026-11-22
- 模块：web
- 类型：功能

## 背景

详情页只有剧情简介可以编辑，季标题与集标题虽然数据层已有 `updateTitle()`，但界面没有任何入口，改错名字只能去改目录或数据文件。同时 `TextEditor` 的编辑图标跟在文本末尾，描述较长时按钮会被挤到段落中间，位置不稳定。

## 目标与取舍

- 季标题、集标题复用 `TextEditor` 就地编辑，写入走既有的乐观更新 + 失败回滚流程。
- `TextEditor` 的内置图标改为默认隐藏，由外层提供编辑入口；只有季/集标题显式开启。
- 描述的编辑按钮固定在「剧情简介」标题右侧，不随文本移动。

方案取舍：

- **图标默认隐藏**：描述已经有独立入口，默认渲染图标会让每个使用点都多一个需要额外定位的元素；默认关闭、按需开启比默认开启再逐个关闭更符合当前用法。
- **只在编辑态拦截点击**：季标题位于 `el-collapse` 头部、集标题位于点击即播放的卡片内。编辑器内部用 `[contenteditable="true"]` 判断是否在编辑，只有编辑时才 `stopPropagation()`，非编辑态的展开/收起与播放行为完全不变。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `web/src/components/common/TextEditor.vue` | `showEditIcon` 默认改为 `false`，补充说明注释 | 图标按需显示 |
| `web/src/components/detail/DetailDescription.vue` | 标题行新增编辑按钮，通过 `edit()` 触发；`TextEditor` 不再显示内置图标 | 按钮位置稳定 |
| `web/src/components/detail/DetailSeason.vue` | 季标题、集标题改用 `TextEditor`（开启图标），新增 `updateSeasonTitle()` / `updateEpisodeTitle()` / `stopEditClick()` | 提供编辑入口并提交写入 |
| `web/AGENTS.md` | 新增「详情页文本编辑」章节 | 记录默认值、入口位置与拦截规则 |

## 实现要点

1. **入口触发**：`TextEditor` 通过 `defineExpose({ edit })` 暴露编辑方法，描述组件用 `useTemplateRef<{ edit: () => Promise<void> }>` 调用，不需要把编辑器状态提升到父组件。
2. **校验与写入**：三个入口都先 `trim()`，空值只提示不落库；随后调用领域对象方法，由其完成乐观更新、请求状态与失败回滚，组件内不直接调用 API。
3. **点击拦截**：`stopEditClick()` 检查 `event.target.closest('[contenteditable="true"]')`，命中才阻止冒泡，保证折叠面板与播放卡片的原有点击语义不被破坏。
4. **样式对齐**：季标题沿用原 `.title` 的字号与主文字色（改为作用于 `.season-name`），集标题容器保留 `text-color-secondary` 与换行规则，视觉与改造前一致。

## 行为变化与兼容性

- 详情页季标题、集标题旁出现编辑图标，点击后可就地编辑，失焦提交。
- 剧情简介的编辑图标从文本末尾移到「剧情简介」标题右侧。
- `TextEditor` 的默认值变化影响所有未显式传 `showEditIcon` 的调用点：改造前只有描述使用该组件，已同步调整。
- 未改动服务端接口与数据文件结构。

## 验证

- `pnpm --filter web type-check`、`npx vite build` 通过；`pnpm exec vitest run` 全部通过（本次改动为组件交互，无新增纯逻辑）。
- Chrome 无头 + CDP 实测（临时片库）：详情页季/集/描述各有一个编辑入口；点击季标题图标 → `contenteditable=true` → 输入 → 真实鼠标点击空白处失焦 → 服务端 `GET /data/series/:id` 返回新标题；集标题与描述走同一路径，服务端分别返回新标题与新描述。
- 未覆盖：多主题切换下的图标对比度、窄屏下季标题编辑器换行表现，需要人工确认。
