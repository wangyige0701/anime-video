# 新增 Promise 式全局对话框

- 日期：2026-11-28
- 模块：web
- 类型：功能
- 涉及模块：web

## 背景

详情页的 Bangumi 同步弹窗把「打开状态、弹窗结构、业务流程」写在同一组件里：`visible` 布尔值配合 `v-model`，关闭后还要靠 `reset()` 清空匹配结果、预览、勾选与步骤。这类写法每多一处弹窗就多一份同样的胶水，且清理逻辑漏一项，下一次打开就会带上上一次的残留。

调用方真正关心的是「用户选了什么」，而不是「弹窗现在是否可见」。因此把弹窗改成一个返回 Promise 的函数：确认时 resolve 结果，取消时 reject，组件卸载即状态释放。

## 新增 `src/utils/dialog/`

| 文件              | 职责                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `index.ts`        | `openDialog()` / `closeAllDialogs()`：建应用、挂载、结算 Promise、卸载           |
| `DialogHost.vue`  | `el-dialog` 宿主：渲染内容组件与页脚按钮，可见性交回给调用方                     |
| `manager.ts`      | `DialogManager`：`confirm` / `cancel` / `setButtons` / `closable` / `unclosable` |
| `devtools.ts`     | 卸载前摘掉 Devtools 缓冲区里该应用的记录（`removeDevtoolsApp` 为纯函数）         |
| `stores/pinia.ts` | 主应用与对话框应用共用的 Pinia 实例                                              |

结果约定：

- 内容组件 `dialog.confirm(data)` → resolve，`data` 即结果；
- 内容组件 `dialog.cancel()`、用户点右上角 / Esc / 遮罩 → reject（`DialogCanceled`）；
- 取消是正常路径：内部给返回的 Promise 挂了一个空 `catch`，调用方漏写也不会抛未处理拒绝。

## 每次打开都是一个新的应用

宿主单独挂载在 `body` 上，关闭动效结束后 `unmount()` 并移除容器。这样内容组件的状态、请求与监听都随卸载释放，不需要再写 `reset()`。

代价与限制一并记录：

- 内容组件拿不到主应用的 `provide`，需要的数据在打开时作为属性传入；
- 对话框应用没有装路由，内容里不能用 `useRoute()`；
- Pinia 必须共用同一实例，所以把 `createPinia()` 从 `main.ts` 提到 `stores/pinia.ts`。

## Devtools 缓冲区必须清理

Vue Devtools 会为每个挂载的应用在 `window.__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__` 压一条记录，应用卸载后不会自动消失。每次打开对话框都是一个新应用，不主动摘掉就会一路累积，每条都抓着应用与组件树，表现为反复开关后浏览器内存与卡顿持续上涨。

`releaseDevtoolsApp()` 在 `unmount()` 之前按 `descriptor.app === app` 找到条目并 `splice`，只在 `import.meta.env.DEV` 下执行，生产构建里整段被摇掉。条目的形状在不同版本里不同（有的是 `[descriptor]`，有的是 descriptor 本身），两种都兼容。

## 路由切换收掉对话框

对话框不在路由树里，切页后会盖在新页面上。`router.afterEach` 调用 `closeAllDialogs()`，逐个走 `cancel` 路径，调用方收到 `DialogCanceled`。

## 影响面

- `main.ts`：改用 `stores/pinia.ts` 导出的实例。
- `router/index.ts`：新增 `afterEach` 回收对话框。
- 未改动任何既有弹窗行为：本批次只落地基础设施，业务接入在下一提交。

## 验证

- 新增 `test/web/dialog-manager.test.ts`（5 例）、`test/web/dialog-devtools.test.ts`（5 例）。
- `pnpm --filter web type-check`、`pnpm exec vitest run` 通过。
- DOM 与生命周期用 CDP 实测（`.cache/sync-confirm-check.mjs` 的夹具）：打开后 `body` 下只有一个 `.el-dialog`；关闭或按 Esc 后 `.el-dialog`、`.el-overlay` 与容器节点全部消失；连续打开两次不会叠出两个；切页面后对话框被收掉；请求进行中 `unclosable` 生效（右上角按钮不存在，Esc 与遮罩都无效）。
