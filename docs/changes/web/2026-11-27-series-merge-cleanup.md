# 收紧合并相关接口可见性并修正拖拽样式冗余

- 日期：2026-11-27
- 模块：web
- 类型：重构
- 涉及模块：web、server

## 背景

合并功能实现后按"废弃代码与多余声明"复查了一遍，发现三处可以收紧或删除的东西：一个只在类内部使用的静态方法被声明为 `public`、一条对 `el-image` 根节点无效的 CSS 拖拽声明、一处卸载时会无条件改写 `document.body` 内联样式的清理逻辑。

## 涉及文件

| 文件                                        | 改动                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `server/data/series.ts`                     | `getMergeOwnerIndex()` 由 `public static` 改为 `private`     |
| `web/src/components/index/SeriesCard.vue`   | 删除 `.img` 上无效的 `-webkit-user-drag`，注释指向真正生效处 |
| `web/src/components/index/useSeriesDrag.ts` | 作用域销毁只在仍处于拖拽态时还原 body 内联样式               |

## 实现要点

1. **`getMergeOwnerIndex()` 收紧为 private**：它只被 `mergeSeries()` 使用。留成 public 等于对外承诺一个"成员 id → 主系列 id"的公开查询，后续调用方会照着它再写一套归属规则；合并归属的判定必须留在规范化与合并校验内部，只有一种实现。
2. **`.img` 上的 `-webkit-user-drag` 是无效声明**：`.img` 是 `el-image` 的根节点，真正被浏览器当作拖拽源的是它内部的 `<img>`，后者由 `.img-wrap :deep(img)` 覆盖。保留会让后来的人以为两处都在起作用，改坏其中一处也不会立刻暴露。`user-select: none` 留在容器上（会继承给占位内容），注释改为指向真正生效的位置。
3. **销毁清理加拖拽态守卫**：`onScopeDispose()` 原本无条件清空 `document.body.style.userSelect/cursor`。正常流程里这两条由 `reset()` 清理，走到销毁说明组件被提前卸载；但若从未进入拖拽（或已正常收尾），此时清空会覆盖其它模块写入的 body 内联样式。改为只在 `state.phase !== 'idle'` 时还原。

## 行为变化与兼容性

- 合并、脱离、拖拽、叠层的运行时行为均无变化。
- `getMergeOwnerIndex()` 没有外部调用方（全库仅 `mergeSeries()` 一处），收紧可见性不影响任何现有代码。
- 样式改动只是删除无效声明，海报与叠层渲染不变；卸载时不再无条件改写 body 样式。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：34 个文件、334 个用例全部通过。
