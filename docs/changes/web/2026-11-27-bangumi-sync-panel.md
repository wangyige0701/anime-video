# Bangumi 同步面板：图标、布局、差异对比与关闭守卫

- 日期：2026-11-27
- 模块：web
- 类型：修复 / 优化
- 涉及模块：web

## 背景

用户在使用同步面板时提出四点：

1. 步骤条**当前进度的圆点是纯白色实心**，在深色面板上过于刺眼；
2. 剧集多选列表**横向布局把整个宽度撑开了**，右侧内容溢出对话框；
3. 系列描述被截断，希望完整多行展示；并指出**与当前完全一致的数据没有必要重复更新**；
4. 面板加载或提交接口调用期间**不应允许关闭对话框**，否则交互被打断。

## 涉及文件

| 文件                                        | 改动                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `web/src/assets/elements/steps.scss`        | 当前步骤改为「主色描边 + 同心内点」，去掉近白实心圆                                |
| `web/src/components/detail/BangumiSync.vue` | 剧集纵向两行布局、描述完整多行、一致项标记与禁用、请求期关闭守卫                   |
| `web/src/utils/bangumiSync.ts`              | 新增 `diffPreview()` 与 `BangumiCurrentSnapshot`；`createSelection` 支持跳过一致项 |
| `test/web/bangumi-sync.test.ts`             | 新增 5 个用例：全一致、空白/集合归一化、顺序判定、缺失字段、总数归零               |
| `docs/modules/web/bangumi-sync.md`          | 新建：流程、差异规则、布局约束、关闭守卫                                           |
| `docs/modules/web/element-theme.md`         | 新增「步骤条的当前步骤」小节，说明三态与 simple 模式无序号文本的限制               |

## 实现要点

1. **纯白圆点的根因**：`is-process` 用了 `background: l-9`（近白）+ `d-5` 字，在 `d-4` 面板上是最亮的一块。改为**主题主色** 1.5px 描边 + 同色同心内点（`::after` inset 4px），既不刺眼又能随主题切换自动协调。`is-finish` 保持 `l-4` 实心以表示「已完成」。

2. **`simple` 模式不渲染序号文本**：`el-step__icon-inner` 在 simple 模式下不存在，圆点是空的。所以只给描边会像「未完成」，必须用 `::after` 补内点。另外 process / finish 的覆盖要带 `.el-step__head` 前缀，否则被 `.el-step.is-simple .el-step__icon { background: 0 0 }` 覆盖回去。

3. **撑宽的真实原因是 `1fr` 的 `auto` 下限**：`.episodes` 用 `repeat(2, 1fr)`，等价于 `minmax(auto, 1fr)`，`auto` 的下限会被最长的不可断词撑开，第二列直接溢出可视区（截图里只能看到第一列）。改为**纵向单列 + 每项两行**（标题一行、文件名一行），彻底消除横向竞争；标题与文件名都 `nowrap + ellipsis`，完整内容走 `title` 悬浮提示。

4. **描述完整展示**：删除 `shorten(60)` 的 JS 截断，改为 `white-space: pre-wrap` + `overflow-wrap: anywhere` 的多行块，原文分段保留、长串不撑破容器。多行文本不加删除线（整段划线会盖住字），用「当前 / Bangumi」两行标签区分。

5. **一致项不进提交**：新增 `diffPreview(preview, current)` 逐项对比，返回 `same` 语义的标记（`true` = 一致）。一致的项禁用勾选框、显示「与当前一致」，`createSelection` 不再默认勾选，`summarizeSelection` 的 `total` 随之减少——「应用 15 项」会变成真实的待写入数量。对比还做了归一化：折叠连续空白、类型按集合比较、顺序按逐位比较。

6. **缺失字段不算一致**：预览里空标题、无日期、空类型不会被判为「已同步过」，否则会误导。这类项仍由 `createSelection` 的「内容为空不勾」规则处理，两条规则叠加。

7. **关闭守卫**：新增 `busy = matching || previewing || applying`，期间隐藏关闭按钮、拦截 Esc、禁用「取消」与「上一步」。同时去掉 `loadMatch` 失败时自动关面板的逻辑——网络抖动会吞掉整个交互，现在保持打开并提示，用户可以就地重试。

## 行为变化与兼容性

- 「应用 N 项」的数字会变小：一致项不再计入。这是修复，不是回归。
- 全一致时按钮禁用（`total` 为 0），与「空提交拦截」一致。
- 匹配失败不再自动关闭面板；用户点「取消」或「重新匹配」继续。
- 请求进行中「取消」不可点，长请求只能等待（这是需求本身要求的取舍）。
- 剧集列表由两列变一列，同一屏可见集数减少，依赖 `el-scrollbar` 滚动。

## 验证

- `pnpm --filter web build-only`：通过；`pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：35 文件 / **355 用例**通过（新增 5 个 `diffPreview` 用例）。
- CDP 实测（`.cache/sync-preview-check.mjs`，目标系列「关于我转生变成史莱姆这档事」，本地数据全空）：
    - 步骤条 `is-process` 的 `border-color` / `color` 均为主色 `rgb(123, 97, 255)`，`background` 透明；
    - `.episodes` 宽 788、容器 818（含 padding），`scrollWidth === clientWidth === 818`，`document` 无横向溢出；
    - 每项高 40px，标题 `top: 3`、文件名 `top: 23`，`white-space: nowrap`；
    - 描述 `pre-wrap`、两项（当前为空、Bangumi 629 字）、`scrollHeight === clientHeight`，未截断；
    - 全选后 `changedChecked: 24`、`sameChecked: 0`，按钮为「应用 30 项」。
- 全一致场景（「学生会也有洞！」）：5 个字段均显示单值 + 「与当前一致」，勾选框全禁用，按钮为「应用 0 项」；点击禁用勾选框不会改变状态。
- 关闭守卫（`.cache/sync-close-guard-check.mjs`）：
    - 断网打开面板 → 匹配失败后 `dialogOpen: true`，空态提示「没有搜索到候选条目…」，只有一条中文错误提示；
    - 恢复网络点「重新匹配」→ 两个季的候选条目正常加载；
    - 预览请求中按 Esc → 面板仍可见（`loading: true`）；请求结束后按 Esc → `visible: false`。
