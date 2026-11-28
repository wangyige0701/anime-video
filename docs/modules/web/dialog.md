# 全局对话框（openDialog）

页面里的弹窗不再各自维护 `visible` 布尔值：调用 `openDialog()` 打开，等它返回的 Promise 拿结果。对话框内容永远是独立组件，宿主只负责挂载、页脚按钮与关闭。

## 1. 为什么是 Promise

「打开 → 用户操作 → 拿着结果继续做事」本来是一条线性流程：

```ts
const total = await openDialog<number>({
	component: SyncDialog,
	title: '同步 Bangumi',
	dialogProps: { class: 'bangumi-dialog', width: '860px' },
	componentProps: { seriesId, snapshot },
});
```

用 `v-model` + `ref` 的写法要把「打开状态」和「结果」都拆到组件外：入口按钮持有一个布尔值、结果靠 emit 回传、关闭后还要手动清空一堆状态，任何一条漏掉就会在下一次打开时带上脏数据。Promise 写法把这三件事合成一次调用，组件卸载即状态释放。

## 2. 分层

| 文件                              | 职责                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `src/utils/dialog/index.ts`       | `openDialog()` / `closeAllDialogs()`；创建应用、挂载、结算 Promise、卸载         |
| `src/utils/dialog/DialogHost.vue` | `el-dialog` 宿主：渲染内容组件与页脚按钮，可见性交回给 `openDialog()`            |
| `src/utils/dialog/manager.ts`     | `DialogManager`：`confirm` / `cancel` / `setButtons` / `closable` / `unclosable` |
| `src/utils/dialog/devtools.ts`    | 卸载前摘掉 Devtools 缓冲区里该应用的记录                                         |
| `src/stores/pinia.ts`             | 全局唯一的 Pinia 实例，主应用与对话框应用共用                                    |

宿主不认识任何业务。两步流程、按钮文案、关闭时机都由内容组件通过控制器决定。

## 3. 结果约定

| 触发                                       | 结果                                  |
| ------------------------------------------ | ------------------------------------- |
| 内容组件调用 `dialog.confirm(data)`        | resolve，`data` 即结果                |
| 内容组件调用 `dialog.cancel()`             | reject，错误为 `DialogCanceled`       |
| 用户点右上角、按 Esc、点遮罩（未被拦截时） | 同上，也走 reject                     |
| 路由切换（`router.afterEach`）             | 调用 `closeAllDialogs()`，同样 reject |

取消是正常路径，不是异常：`openDialog()` 内部给返回的 Promise 挂了一个空的 `catch`，调用方偶尔忘记处理也不会抛未处理拒绝。但调用方仍应显式 `catch`，把「用户取消」和「真的失败」分开。

## 4. 内容组件

内容组件会额外收到 `dialog` 属性（控制器）；`componentProps` 里的同名键可以覆盖它。

```ts
const props = defineProps<{
	seriesId: string;
	dialog: DialogManager<number>;
}>();
```

独立应用带来的限制，写对话框内容时必须知道：

- **拿不到主应用的 `provide`**：详情页的 `DETAIL_SERIES_DATA` 之类在对话框里是空的，需要的数据在打开时作为属性传进来（例如 `buildCurrentSnapshot()` 压出的快照）。
- **不要用 `useRoute()`**：对话框应用没有装路由。需要跳转就在 resolve 之后由调用方处理。
- **组件与指令照常可用**：`el-*` 组件与 `v-loading` 由编译期解析，不依赖应用级注册；`ElMessage` 这类函数式组件挂在 `body` 上，也不受影响。
- **Pinia 共享**：`openDialog()` 用的是 `stores/pinia.ts` 的实例，对话框里读到的就是主应用已初始化的状态。

## 5. 页脚按钮

按钮是纯数据声明，由内容组件按当前状态整组替换：

```ts
// 状态到按钮的映射写成纯函数（describeSyncFooter），可单测
watchEffect(() => {
	props.dialog.setButtons(footer.value.map((button) => ({ ...button, onClick: actions[button.key] })));
});
```

- 不要逐个 `show/hide`：两步流程的按钮集合完全不同，整组替换不容易漏掉残留按钮。
- `key` 参与列表 diff，同一组内必须唯一；`content` 走插槽而不是属性。
- `setButtons([])` 清空页脚，适合「只读」类对话框。

## 6. 关闭拦截

`dialog.unclosable()` 同时关掉右上角、Esc 与点击遮罩，`closable()` 恢复成打开时声明的值（不是硬编码 `true`）。请求进行中调用 `unclosable()`，避免响应写回已经关闭的视图。

## 7. 生命周期与清理（关键）

每次打开都会新建一个只含宿主的 Vue 应用：

1. 创建容器 `div` 挂到 `body`，`createApp(...).use(pinia).mount(container)`；
2. 关闭动效结束时 `el-dialog` 抛出 `closed` → 结算 Promise（若尚未结算则 reject）→ `app.unmount()` → 移除容器。

**必须清理 Devtools 缓冲区**：Vue Devtools 会为每个挂载的应用往 `window.__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__` 压一条记录，应用卸载后这条记录不会自己消失。每条记录都抓着应用实例与整棵组件树，反复开合同一个对话框就会一路累积，表现为浏览器内存与卡顿持续上涨。`releaseDevtoolsApp()` 在 `unmount()` 之前移除对应条目，并且只在 `import.meta.env.DEV` 下执行（生产构建里这段会被摇掉）。

其它清理点：

- 容器 `div` 必须 `remove()`，否则 `body` 会残留空节点；
- 关闭入口集合 `closers` 在销毁时注销，路由切换时才不会去关已经销毁的对话框；
- 内容组件自己的异步请求随组件卸载自然失效，不需要额外的取消逻辑。

## 8. 已知限制

- 同一时刻可以开多个对话框，但业务上应避免：`closeAllDialogs()` 只按打开顺序逐个关闭。
- 对话框内容不能用 Provide/Inject 拿页面上下文、不能用路由；需要这些能力时说明该内容不应该做成对话框。
- `DialogManager` 只暴露当前用得到的控制面（确认、取消、按钮、可关闭）。需要 `getRef`、动态改 `el-dialog` 属性时再按需扩展，不要先建一套通用 API。

## 9. 验证

```bash
pnpm exec vitest run test/web/dialog-manager.test.ts test/web/dialog-devtools.test.ts
pnpm --filter web type-check
```

与 DOM 相关的部分用 CDP 实测（`.cache/sync-confirm-check.mjs` 可直接复用），至少覆盖：

- 打开后 `body` 下只有一个 `.el-dialog`，关闭后 `.el-dialog`、`.el-overlay` 与容器节点都消失；
- 连续打开两次不会叠出两个对话框；
- 请求进行中右上角关闭按钮不存在，Esc 与遮罩都无效；
- 非忙碌时 Esc 能关闭，且 `body` 子节点回到打开前的数量；
- 切页面后对话框被收掉。
