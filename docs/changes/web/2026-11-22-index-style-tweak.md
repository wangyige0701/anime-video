# 列表分割线与分段选择器样式修正

- 日期：2026-11-22
- 模块：web
- 类型：样式
- 涉及模块：web

## 背景

首页月分割线的标题使用 `$text-color-primary`（纯白），字号 `0.9375rem`，在深色背景上比卡片标题更亮，视觉重心错位。分段选择器（`el-segmented`）的主题覆盖此前写在 `IndexFilterBar.vue` 的 `.switcher` 里，属于局部覆盖：只有首页过滤栏生效，其它位置复用组件时会退回 Element Plus 默认的浅色变量；且未覆盖 `--el-segmented-item-active-bg-color`，按下未选中项时该变量回落为 `--el-fill-color-darker`，整块瞬间变成浅灰白。

## 目标与取舍

1. 分割线降级为「分组提示」层级：标题改用次级文字色 `l-7`、字号降到 `0.8125rem`；分隔线由 `l-2` 换成更暗的 `d-3`；数量文案进一步降到 `0.6875rem`。
2. 分段选择器的全部主题变量抽到全局覆盖文件 `assets/elements/segmented.scss`，并在 `elements.scss` 注册，和 `button/input/popover` 等覆盖保持同一层级；显式补上按压态与禁用态变量。

取舍：没有改 Element Plus 的默认尺寸（`size="small"` 仍由调用方决定），只覆盖颜色变量，避免影响已有布局高度；分割线只调整颜色与字号，不改结构，因此不需要新增测试。

## 涉及文件

| 文件                                          | 改动                                     | 原因                                     |
| --------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `web/src/assets/elements/segmented.scss`      | 新增分段选择器全局变量覆盖               | 统一所有使用位置的主题表现，修复按压变白 |
| `web/src/assets/elements.scss`                | 注册 `segmented.scss`                    | 与其它 Element Plus 覆盖同批加载         |
| `web/src/components/index/IndexFilterBar.vue` | 删除 `.switcher` 内的局部变量            | 避免两处维护同一套变量                   |
| `web/src/components/index/IndexList.vue`      | 分割线标题、线条、数量文案降低亮度与字号 | 视觉层级修正                             |

## 实现要点

- 按压态 `--el-segmented-item-active-bg-color` 显式取主题 `d-4`（比底色 `d-3` 暗一档），不再发白。
- 悬浮态取 `d-2`，选中态保持 `primary` + `#fff`，与改造前一致。
- 分段项选中背景的 `--el-segmented-item-selected-box-shadow` 置空，避免默认阴影在深色底上形成浅色描边。

## 行为变化与兼容性

仅为样式调整，不改变 DOM 结构与交互逻辑。其它页面后续使用 `el-segmented` 时会自动继承这套深色变量，不再需要各页面重复覆盖。

## 验证

- `cd web && npx vite build` 通过，Sass 变量与全局覆盖正常编译。
- 手工检查：首页分割线标题为次级灰、字号变小；元素在深色主题下按压分段项不再变白；切换主题（`xingyezi` 等五套）后分割线与分段按钮颜色随主题变化。

## 关联文档

- `web/AGENTS.md`：`## 验证要求`
- `docs/modules/web/index-filter.md`：过滤栏组成
