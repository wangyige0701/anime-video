# Bangumi 同步弹窗拆分为组件并接入 openDialog

- 日期：2026-11-28
- 模块：web
- 类型：重构
- 涉及模块：web

## 背景

`components/detail/BangumiSync.vue` 一个文件 856 行：入口按钮、对话框模板、两步面板、三段请求、勾选状态、`reset()`、以及 280 行以 `body .el-dialog.bangumi-dialog` 为根的全局样式。改一处样式要在上千行里定位，流程逻辑也被模板和样式夹在中间。

同时这套弹窗依赖 `inject(DETAIL_SERIES_DATA)` 读详情页的系列对象，只能作为一个「页面内的组件」存在，无法复用上一提交的 `openDialog()`。

## 拆分

| 文件                                               | 职责                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `components/detail/BangumiSync.vue`                | 只剩入口按钮：打开对话框、显示成功提示、写入后刷新并 emit             |
| `components/detail/bangumi-sync/SyncDialog.vue`    | 步骤条、两步面板的挂载、页脚按钮改写、忙碌时禁止关闭                  |
| `components/detail/bangumi-sync/MatchStep.vue`     | 第一步：季与候选条目的多选                                            |
| `components/detail/bangumi-sync/PreviewStep.vue`   | 第二步：系列字段、季标题、重排、逐集标题                              |
| `components/detail/bangumi-sync/useBangumiSync.ts` | 三段请求、勾选状态、派生状态（`footer` / `summary` / `seriesFields`） |

数据传递：对话框跑在独立应用里拿不到 `provide`，入口在打开时用 `buildCurrentSnapshot(series.value)` 压出快照传进去；写入成功后仍由入口调用 `refreshSeries()` 并 emit `applied`，对话框内容不认识详情页与路由。

新增三个纯函数（都在 `utils/bangumiSync.ts`，均有单测）：

- `buildCurrentSnapshot(source)`：把领域对象压成对比快照，类型数组做拷贝；
- `describeSelectionSummary(summary)`：页脚/汇总条的四类计数文案；
- `describeSyncFooter(state)`：两步各自的按钮集合、文案、loading 与禁用。

## 行为变化

- **页脚汇总移到内容顶部**。原来「将写入 8 项：系列字段 2 · 集标题 5 · 重排 1 季」在 `#footer` 左侧，需要给宿主额外做插槽才能保持；现在作为预览面板顶部的汇总条，滚动时留在内容里，「应用 N 项」按钮本身已经带数量。
- **入口不再显示匹配 loading**。原来点开入口后按钮一直转圈直到匹配返回；现在入口在对话框打开期间置灰（`status.opening`），加载状态由对话框内的 `v-loading` 表达。
- **关闭即卸载**。不再需要 `reset()`：匹配结果、预览、勾选与步骤随应用销毁释放，重复打开不会带上上一次的数据。
- **样式改为组件作用域**。内容组件都在自己的 scoped 块里，只有 `el-select` 下拉面板（teleport 到 `body`）保留一小段非 scoped 规则。原先针对 `.el-dialog` 根的 280 行全局样式已删除。
- **关闭守卫改由控制器表达**：`busy` 时调 `dialog.unclosable()`（同时关掉右上角、Esc 与遮罩），`closable()` 恢复成打开时声明的值。

## 影响面

- `BangumiSync.vue` 的对外接口（`seriesId` prop、`applied` 事件）不变，详情页不需要改。
- 预览、勾选、提交的结构与判定完全沿用 `utils/bangumiSync.ts`，服务端接口与入参未变。
- 交互细节（两步、按钮文案、状态色、布局约束）保持上一版的设计。

## 验证

- `test/web/bangumi-sync.test.ts` 扩到 33 例：新增快照构造、汇总文案、两步页脚状态（含忙碌与空勾选）。
- `pnpm --filter web type-check`、`pnpm --filter web build`、`node scripts/check-vue-tags.mjs`、`pnpm exec vitest run`（42 文件 / 421 例）通过。
- CDP 实测（`.cache/sync-confirm-check.mjs` 固定夹具，无需真实后端）：
    - 打开后只有一个 `.el-dialog`，标题、「取消 / 重新匹配 / 生成预览」正确；点「生成预览」后页脚变为「取消 / 上一步 / 应用 8 项」，顶部汇总条与分组统计一致；
    - 取消与 Esc 关闭后 `.el-dialog`、`.el-overlay` 与容器节点全部消失，`body` 子节点回到打开前；
    - 重新打开仍是单个对话框，不叠加，状态干净；
    - 匹配请求进行中右上角关闭按钮不存在，`取消 / 重新匹配 / 生成预览` 全部禁用，Esc 与遮罩点击都无效；
    - 点「应用 8 项」后对话框关闭、提示「已写入 Bangumi 数据 8 项」、入口恢复可用，无控制台异常；
    - 切到首页后对话框被 `router.afterEach` 收掉；
    - 五个主题下截图复核排版与对比度，与上一版一致。
