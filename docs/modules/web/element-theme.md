# 组件库全局样式封装

Element Plus 的主题适配只允许发生在 `web/src/assets/elements/` 这一层。页面与业务组件负责布局，不负责组件库的配色、字号与描边。改这三类东西时先看这里有没有对应文件，没有就新增一个并登记到 `elements.scss`。

## 1. 职责边界

| 层                               | 负责                                                    | 不负责                       |
| -------------------------------- | ------------------------------------------------------- | ---------------------------- |
| `web/src/assets/root.scss`       | 主题色阶生成、`--el-color-primary` 系列映射、字体与选区 | 单个组件的形态               |
| `web/src/assets/elements/*.scss` | 单个组件的默认变量 → 主题梯度的映射、默认尺寸与形态     | 业务排版（padding/结构/gap） |
| `web/src/assets/elements.scss`   | 汇总入口，新增组件必须在这里登记                        | —                            |
| 页面 / 业务组件的 `<style>`      | 自己的盒子模型、间距、栅格、内容排版                    | `--el-*` 变量覆盖            |

判断标准很简单：**换一个使用该组件的地方，这段样式还要不要？** 要，就属于全局层。

## 2. 为什么必须集中

Element Plus 的默认变量按亮色主题取值：

- `--el-fill-color-blank` 是白色（输入框、勾选框、默认按钮的底）；
- `--el-text-color-primary` 是近黑；
- `--el-bg-color-overlay` 是白色（下拉、弹层）。

只有少数组件（`el-input`、`el-segmented`、`el-popover`）在项目里被单独适配过，其余组件在深色界面上会露出亮斑。逐个页面覆盖会带来两个后果：同一个组件在不同页面长得不一样；改一次配色要翻遍所有页面。

另有一类组件**必须**在全局层处理：`el-dialog`、`el-select` 的下拉、`el-popper` 全部 `append-to-body`，页面里的 `scoped` 样式根本命中不到，只能写在非 scoped 块里——既然如此，就写一次给所有页面用。

## 3. 变量语义

`--theme-light-1..9`（`l-*`）由主色与白混合、`--theme-dark-1..9`（`d-*`）由主色与黑混合，数字越大越亮/越深：

| 语义            | 取值          | 典型用途                          |
| --------------- | ------------- | --------------------------------- |
| 主文字          | `l-9`         | 标题、选中项文字                  |
| 常规文字        | `l-8`         | 正文                              |
| 次级文字        | `l-6` / `l-7` | 说明、未激活步骤                  |
| 弱文字 / 占位   | `l-5`         | placeholder、禁用文字             |
| 描边            | `l-3` / `l-4` | 卡片边框、勾选框、分隔线          |
| 浮层底色        | `d-5`         | 对话框、下拉面板                  |
| 块级卡片        | `d-4`         | 分组块、输入框、默认按钮          |
| 悬浮 / 选中底色 | `d-3` / `d-2` | hover、下拉选中项、主色按钮 hover |

不要用 `#fff` / `#000` / `rgba(0,0,0,.1)` 这类字面量，除了滑块、对勾这种必须在任何主色下都纯白的元素。

## 4. 三个容易踩的权重问题

1. **组件在自己身上声明变量，继承覆盖不了**。`.el-button` 里写着 `--el-button-bg-color: var(--el-fill-color-blank)`，在 `body` 上改 `--el-fill-color-blank` 不会影响它（它读的是自己层声明的那份）。必须在同元素上用选择器覆盖。
2. **一条 `.el-button` 覆盖会把 `is-text` / `is-link` / `is-plain` 和各状态色一起打掉**。`button.scss` 因此用了 `:not(.is-text):not(.is-link):not(.is-plain):not(.icon):not(.el-button--primary)…` 的排除链。新增变体时记得同步排除，否则文字按钮会变成实心方块。
3. **多选下拉的对勾由更具体的选择器设置**。Element 用
   `.el-select-dropdown.is-multiple .el-select-dropdown__item.is-selected:after` 给对勾上色，
   写在 `&.is-selected::after` 里权重不够，会被静默忽略。必须按同样的选择器结构在 `body` 下再写一条。

## 5. 滚动条

**统一使用 `el-scrollbar`，不用原生滚动条。** 原生滚动条不受主题控制，Windows 上是一条带箭头的灰色轨道；`scrollbar-width: thin` 只能改粗细，改不了配色。

- 配色、粗细、圆角集中在 `scrollbar.scss`，页面里只写 `<el-scrollbar>`；
- 纵向滑块宽度由 `.el-scrollbar__bar.is-vertical` 决定（`__thumb` 是 `width: 100%`），给 `__thumb` 设宽度不会生效；
- 需要「滚动区高度上限」时用 `max-height` prop，不要自己写 `overflow: auto`；
- 对隐藏滚动条的场景（如横向滑动区域），用原有的 `HorizontalScroll`，不要新写一处 `::-webkit-scrollbar` 隐藏。

## 6. 已覆盖的组件

`button`、`input`、`select`、`checkbox`、`switch`、`segmented`、`steps`、`dialog`、`popover`、`tooltip`、`scrollbar`、`loading`。

新增适配时：在 `elements/` 下建 `<组件名>.scss` → 只写变量映射与默认尺寸 → 在 `elements.scss` 里 `@use` → 补一条变更记录。

## 7. 已知限制

- 只适配了深色主题。`root.scss` 里没有亮色分支，新增亮色主题时这一层要整体过一遍。
- `el-select` 的 `is-focused` 仍用主色描边（`primary`），没有改成 `l-*` 梯度——主色在深色底上是可辨识的，且能表达「当前焦点」。
- `el-tag` 只在 `.el-select` 内部做了深色适配，其它位置的彩色标签仍走 Element 的状态色。

## 8. 验证方式

改动这一层后至少跑一遍：

```bash
pnpm --filter web build-only      # Sass 编译 + 产物
pnpm --filter web type-check
pnpm exec vitest run
```

视觉核对用 CDP 取计算样式，不要只看截图：选中态、hover 态、对勾这类细节在缩略截图里看不出来。可参考 `.cache/ui-theme-check.mjs` 的写法（`getComputedStyle(el, '::after')` 取伪元素）。
