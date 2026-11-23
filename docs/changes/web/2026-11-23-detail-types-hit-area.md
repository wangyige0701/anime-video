# 详情页类型字段热区扩展到整个单元格

- 日期：2026-11-23
- 模块：web
- 类型：样式
- 涉及模块：web

## 背景

详情页元数据栏里「类型」的可点击区域由 `el-popover` 的 reference 元素决定。原实现中 reference 是自适应尺寸的 `.types-container`，因此只有 chips 本身连同其 10px 内边距可以点击，chips 右侧的空白与单元格剩余高度都点不动，热区明显小于同格其它位置。

## 目标与取舍

- 可点击区域覆盖「类型」标签以下的整个单元格：宽度铺满，高度铺满单元格剩余空间。
- 标签「类型」保持不可点击，仍由 `DetailMetadata.vue` 渲染，不并入 reference。
- chips 的视觉位置、换行规则、悬停高亮样式保持不变。

方案取舍：

- **不用负外边距铺到单元格边框**：需要给 `.item` 让出内边距或额外加圆角裁剪，改动面扩大到元数据栏结构，收益只是左右各多出 20px。
- **不把标题挪进 reference**：需求只要求扩大热区，标题仍属于元数据栏的字段名，不参与交互。
- **`flex: 1` 而不是固定宽高**：单元格高度由内容撑开，chips 换行到两行时热区自动跟随，不需要额外测量。

## 涉及文件

| 文件                                        | 改动                                                                                                                                                                    | 原因                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `web/src/components/detail/DetailTypes.vue` | `.detail-types` 增加 `flex: 1` 与 `align-items: stretch`；`.types-container` 用 `flex: 1` 取代 `max-width`，并加 `align-content: center`；`.placeholder` 增加 `flex: 1` | 让 reference 铺满单元格 |

## 实现要点

1. `.detail-types` 是元数据单元 `.item`（列向 flex）的最后一个子元素，`flex: 1` 让它吃掉标题以下的全部剩余高度，`align-items: stretch` 覆盖 `metadata-content` 的 `center`，使 reference 在交叉轴上被拉满。
2. `.types-container` 改为 `flex: 1` 后宽度等于单元格内容宽度，原先用于允许溢出 10px 的 `max-width: calc(100% + 10px)` 失去意义，直接删除。
3. 容器被拉高后，chips 靠 `align-content: center` 保持垂直居中，`padding: 10px` 与 `transform: translateX(-10px)` 保留，chips 的起始位置与改动前一致。
4. `align-content` 只对换行容器生效，chips 换成两行时依旧按行居中，不会贴顶。

## 行为变化与兼容性

- 点击 chips 之外的空白区域（标签下方）同样可以打开类型下拉；标签本身不触发。
- chips 位置、换行、选中态、悬停高亮颜色不变，元数据栏高度不变。
- 不涉及请求、数据层与 popover 提交逻辑。

## 验证

- `pnpm --filter web type-check` 通过。
- `pnpm --filter web build` 通过。
- 无头浏览器渲染等宽元数据栏，对照默认态与悬停态：热区矩形宽度等于单元格内容宽度，纵向从标签下方一直延伸到单元格底部内边距，标签「类型」不在热区内；chips 换行与位置与改动前一致。
- 仓库根目录 `pnpm exec vitest run`：19 个测试文件 / 186 个用例通过。

## 关联文档

- `web/AGENTS.md`：`## 样式与主题`
- 相关历史记录：`docs/changes/web/2026-11-17-drag-handle-hit-area.md`（同类热区调整）
