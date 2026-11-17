# 季/集拖拽手柄热区放大并修复拖拽起始异常

- 日期：2026-11-17
- 模块：web
- 类型：修复
- 涉及模块：web

## 背景

排查“季排序没保存”时用无头浏览器复现真实拖拽，发现两处体验问题：

1. 每次开始拖拽，控制台都抛出 `TypeError: Converting circular structure to JSON`，栈指向 `vue-draggable-plus` 的 `onStart`。原因是拖拽库默认 `clone` 用 JSON 深拷贝被拖拽项，而 `Season` / `Episode` 实例内部持有 `Ref`（循环引用）。异常发生在库自己的 `onStart` 中，用户传入的 `onStart` 排在其后，因此**失败快照从未被记录**，请求失败时无法回滚顺序。
2. 手柄热区只有 16×16，比图标本身还小，鼠标很容易抓空；`el-icon` 默认 `width/height: 1em` 且 `box-sizing: border-box`，单纯加 `padding` 不会扩大热区。

## 目标与取舍

- 拖拽起始不再抛异常，`onStart` 快照可靠。
- 手柄热区放大到约 24×24，视觉上图标仍保持 16px，不改变现有排版。
- 交互反馈更明确：悬停提亮、按下时 `grabbing`、拖拽时不选中文本。

方案取舍：

- **不把整个季头部做成拖拽区**：头部点击用于展开/收起，扩大拖拽区会与折叠交互争抢，误拖概率高。
- **不用 `padding` 扩热区**：`el-icon` 是 `box-sizing: border-box`，`padding` 只会挤压图标；改为显式 `width/height: 24px` + 负外边距抵消占位。
- **`clone` 直接返回原对象**：拖拽不需要副本，只有跨列表复制才用得到；原样返回既避免深拷贝开销也绕开循环引用。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `web/src/components/detail/DetailSeason.vue` | 两个手柄图标 `:size` 14 → 16；`.drag-handle` 与 `.season-handle` 合并为 24×24 热区样式，补 `:active` 与 `user-select`；`useDraggable` 增加 `clone` | 扩热区、修异常 |
| `web/src/views/[seriesId]/[name].vue` | 季 `useDraggable` 增加 `clone: (season) => season` | 同上 |
| `docs/modules/web/detail-season-sort.md` | 补充 `clone` 与热区约束 | 模块文档描述现状 |
| `docs/modules/web/detail-episode-sort.md` | 同步剧集层约束 | 同上 |

## 实现要点

1. `clone: (value) => value` 传给 `useDraggable`，库不再对领域对象做 JSON 深拷贝；`onStart` 里的 `seasonSnapshot` / `orderSnapshot` 恢复可靠。
2. 手柄样式统一为：

   ```scss
   .drag-handle,
   .season-handle {
       cursor: grab;
       opacity: 0.5;
       width: 24px;
       height: 24px;
       margin: -4px;
       border-radius: 4px;
       user-select: none;
       &:hover { opacity: 1; color: token.$text-color-primary; }
       &:active { cursor: grabbing; }
   }
   ```

   负外边距抵消多出来的 8px，视觉位置与改动前一致。
3. 图标尺寸通过 `:size="16"` 设置 `font-size`，热区由宽高决定，两者互不影响。

## 行为变化与兼容性

- 手柄可点击区域由 16×16 变为 24×24，图标视觉大小 16px 不变，布局不位移。
- 拖拽开始不再产生控制台异常；失败回滚依赖的快照开始生效。
- 不影响点击播放、季折叠、排序提交链路。

## 验证

- `pnpm --filter web type-check` 通过。
- 无头浏览器实测：手柄 `getBoundingClientRect()` 为 24×24（改动前 16×16），季与集两级手柄一致；连续拖拽控制台无异常。
- 端到端验证记录见 `docs/changes/server/2026-11-17-sort-order-cache-sync.md`。

## 关联文档

- `docs/modules/web/detail-season-sort.md`
- `docs/modules/web/detail-episode-sort.md`
- 相关历史记录：`docs/changes/web/2026-11-17-season-drag-sort.md`、`docs/changes/server/2026-11-17-sort-order-cache-sync.md`
