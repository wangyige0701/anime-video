# 补齐系列合并的模块文档与作用域清理

- 日期：2026-11-27
- 模块：web
- 类型：文档
- 涉及模块：web、server

## 背景

系列合并的四批实现（服务端数据层、接口、前端数据层、首页拖拽、详情页季拼接）已经落地，但知识仍然散落在代码与变更记录里：`AGENTS.md` 没有合并相关章节，`docs/modules/` 没有对应的模块文档，后来的人只能靠读 `useSeriesDrag.ts` 反推交互状态机与那些"看起来可以删掉、删了就坏"的约束。本次把这一层的结论固化下来。

同时补上一个资源释放缺口：`useSeriesDrag()` 在拖拽期间给 `document.body` 加了 `user-select` / `cursor` 内联样式，若拖拽中被路由切走，作用域销毁时原先没有还原，页面会带着拖拽光标进入下一个视图。

## 涉及文件

| 文件                                        | 改动                                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| `docs/modules/web/series-merge.md`          | 新建，7 节：职责边界、数据模型、状态机、约束、季拼接等 |
| `web/AGENTS.md`                             | 新增「首页系列合并」章节，指向模块文档                 |
| `server/AGENTS.md`                          | 新增「合并关系（mergedIds）」小节，数据接口边界补一句  |
| `docs/modules/README.md`                    | 模块地图新增一行                                       |
| `web/src/components/index/useSeriesDrag.ts` | `onScopeDispose()` 清理回位定时器与 body 内联样式      |

## 实现要点

1. **模块文档只写"为什么"，不重复代码**：三条不变式的推导、状态机四个阶段各自触发条件、六条不可删除的约束（阈值与点击共存、原生图片拖拽必须拦掉、翻转类名延后一帧、滚动加载复用通道、命中检测依赖 `pointer-events: none`、叠层上限只影响展示），以及已知限制（触摸设备不支持拖拽、成员不能直接拖走、Bangumi 同步只覆盖主系列自身的季、分页前移）。
2. **两处 `AGENTS.md` 各写各的边界**：`web/AGENTS.md` 讲前端侧（单一数据源、纯函数归属、`allSeries` 与 `querySeries` 必须并存、不要接通用拖拽库、原生图片拖拽双保险）；`server/AGENTS.md` 讲服务端侧（`normalizeMergeGroups()` 是唯一收敛点、只能在扫描期校验、必须逐项比对只写回变化项、两个端点与 DTO 键位置、合并是纯展示层聚合）。
3. **不在两处维护同一段细节**：模块文档承载状态机与交互约束，`AGENTS.md` 只保留摘要加链接，符合 `docs/modules/README.md` 第 3 节的新建条件与第 5 节的链接要求。
4. **作用域清理**：`resetTimer` 提升为函数级变量，`reset()` 与 `onScopeDispose()` 都会清掉它；销毁时同时还原 `document.body.style` 的 `userSelect` / `cursor`。

## 行为变化与兼容性

- 文档改动不影响运行时行为。
- `onScopeDispose()` 只在组件卸载时执行，且只清空自己写入的两条内联样式，不影响其它逻辑对 `body` 的使用；正常结束拖拽的路径与之前一致（`reset()` 走同一处清理）。

## 验证

- `pnpm runtime type-check`（`vue-tsc --build`）：通过。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：全部通过。
- 文档复核：模块文档 7 节与代码实际行为逐条对照（阈值 6px、节流 500ms、叠层上限 3、`mergedIds` 顺序语义、季手柄隐藏条件）。
