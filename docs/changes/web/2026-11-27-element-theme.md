# 建立组件库全局样式封装层并修正三处 UI

- 日期：2026-11-27
- 模块：web
- 类型：重构
- 涉及模块：web

## 背景

Element Plus 的默认变量按亮色主题取值，项目此前只对 `el-input`、`el-segmented`、`el-popover`、`el-switch`、`el-tooltip` 做过适配，其余组件在深色界面上露出亮斑。Bangumi 同步对话框是典型：`el-dialog`、`el-steps`、`el-select`、`el-checkbox`、`el-button` 的配色全部写在该组件的非 scoped 样式块里，一次覆盖十几个 `--el-*` 变量。

这带来三个问题：

1. 同一个组件在不同页面长得不一样，改一次配色要翻遍所有页面；
2. 变量散落，新增组件时没人知道该抄哪一份；
3. 部分细节永远配不对——下拉选中项在 `d-5` 面板上用主色紫字和紫对勾，几乎看不见（用户反馈「选中项看不到选中的样式」）。

本次把这一层抽出来，并把三处被点名的 UI 一并修正。

## 涉及文件

| 文件                                           | 改动                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `web/src/assets/elements.scss`                 | 汇总入口，登记全部组件模块                                       |
| `web/src/assets/elements/dialog.scss`          | 新增：对话框底色、描边、三级文字、标题字号与关闭按钮             |
| `web/src/assets/elements/steps.scss`           | 新增：simple 模式步骤条的字号、序号圆点、箭头                    |
| `web/src/assets/elements/select.scss`          | 新增：输入框容器、下拉面板、**选中项与对勾**、多选标签           |
| `web/src/assets/elements/checkbox.scss`        | 新增：透明底、主题描边、禁用态                                   |
| `web/src/assets/elements/scrollbar.scss`       | 新增：滚动条配色、粗细、圆角                                     |
| `web/src/assets/elements/button.scss`          | 重写：区分默认/主色/图标按钮，补 `is-*` 排除链                   |
| `web/src/components/detail/BangumiSync.vue`    | 入口按钮去 `text`、正文换 `el-scrollbar`、删除全部 `--el-*` 覆盖 |
| `web/src/components/detail/DetailTypes.vue`    | 类型列表换 `el-scrollbar`                                        |
| `web/src/components/detail/DetailMetadata.vue` | 删除原生滚动条样式                                               |
| `web/src/App.vue`                              | 删除主容器重复的滚动条变量                                       |
| `docs/modules/web/element-theme.md`            | 新建：分层、变量语义、权重陷阱、滚动条约定与验证方式             |

## 实现要点

1. **一个组件一个文件**，只做「默认变量 → 主题梯度」的映射与默认尺寸，不写业务排版。页面侧只剩盒子模型、间距、栅格。
2. **主色按钮的 hover 反向修正**：Element 默认把 hover/active 往白里混（`--el-color-primary-light-3/-5`），按下反而变亮。改为 `d-2` / `d-3`，与深色主题「越按越深」一致。
3. **默认按钮必须排除变体**：一条 `.el-button` 覆盖会把 `is-text`、`is-link`、`is-plain`、`.icon` 和各状态色一起变成实心方块，因此用 `:not()` 链显式排除。
4. **下拉选中项不再依赖主色对比度**：`is-selected` 改为「`d-2` 提亮底 + `l-9` 亮字 + 白色对勾」。对勾由 Element 用 `.el-select-dropdown.is-multiple …:after` 设置，权重高于嵌套的 `&.is-selected::after`，必须按同样结构在 `body` 下再写一条才会生效。
5. **步骤条只改 simple 模式**：标题由 `16px` 收到 `0.875rem` 与正文一致；序号圆点 `16px/2px` 描边改为 `18px/1px`，数字 `0.75rem`；箭头由两根 `15px` 斜线缩到 `8px`，与圆点比例协调。横向/纵向模式保持 Element 默认。
6. **滚动条统一 `el-scrollbar`**：对话框正文与类型下拉的原生 `overflow: auto` + `scrollbar-width: thin` 换成 `el-scrollbar`，配色收到 `scrollbar.scss`。注意纵向滑块宽度由 `__bar.is-vertical` 决定，`__thumb` 是 `width: 100%`，直接设宽度无效。
7. **同步入口改为描边按钮**：去掉 `text`，颜色交给全局默认按钮，组件内只剩 `height` / `padding` / `font-size` 与标题行配合。

## 行为变化与兼容性

- 视觉变化限定在色彩、字号、描边与滚动条外观，DOM 结构只多了两层 `el-scrollbar` 包裹，无交互语义变化。
- `el-dialog` 标题字号 `1rem` + 字重 600；正文 `0.875rem`。其它使用 `el-dialog` 的页面同步生效。
- 主色按钮 hover/active 由变亮改为变深；`is-text`/`is-link`/`is-plain`/`.icon` 变体不受影响。
- 滚动条在全部 `el-scrollbar` 处统一为 `6px`、`l-8` 配 `0.35` 不透明度，hover 提到 `0.75`。
- `DetailMetadata` 的类型下拉高度上限由 CSS `max-height` 改为 `el-scrollbar` 的 `max-height` prop，值仍为 `240px`。

## 验证

- `pnpm --filter web build-only`：构建通过（Sass 编译无警告）。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：35 文件 / 350 用例通过。
- CDP 取计算样式（`.cache/ui-theme-check.mjs`、`ui-theme-check2.mjs`）：
    - 入口按钮 `background: d-4`、`border: l-3`、`color: l-8`、`height: 32px`；
    - 对话框 `background: d-5`、`border: l-3`、标题 `16px`、正文 `overflow: visible` 且存在 `.el-scrollbar`；
    - 步骤条标题 `14px`、当前步 `font-weight: 600`、圆点 `18×18`、箭头 `8px` / `l-4`；
    - 下拉 `is-selected` 背景 `d-2`、文字 `l-9`、字重 `500`、对勾 `l-9`（`::after` 计算值）；
    - 多选标签背景 `d-3`、文字 `l-8`；
    - 已勾选方框背景与描边均为主色。
- 截图核对：入口按钮、第一步、第二步（含 15 个勾选项）与展开的下拉列表均与深色主题一致，下拉最后一项有明显高亮与白色对勾。
