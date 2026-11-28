import type { App } from 'vue';
import type { DialogButtonConfig, OpenDialogOptions } from './types';
import { createApp, h, ref, shallowReactive } from 'vue';
import { pinia } from '@/stores/pinia';
import DialogHost from './DialogHost.vue';
import { releaseDevtoolsApp } from './devtools';
import { DialogManager } from './manager';

export { DialogManager } from './manager';
export type { DialogButtonConfig, OpenDialogOptions } from './types';

/** 用户关闭对话框（取消按钮、右上角、Esc、点击遮罩）时 Promise 的拒绝原因 */
export class DialogCanceled extends Error {
	constructor() {
		super('dialog canceled');
		this.name = 'DialogCanceled';
	}
}

/** 已打开对话框的关闭入口，路由切走时统一收掉 */
const closers = new Set<() => void>();

/**
 * 以 Promise 的方式打开对话框。
 *
 * 每次调用都新建一个只挂一个宿主的 Vue 应用，挂到 `body` 上，关闭动效结束后连同节点一起卸载，
 * 因此对话框内容不需要在外层模板里预留 `v-model`、也不用担心残留状态。
 *
 * 结果约定：
 * - 内容组件调用 `dialog.confirm(data)` → resolve，`data` 即结果；
 * - 用户取消或用任意方式关闭 → reject，错误类型为 `DialogCanceled`。
 *
 * 调用方应当处理取消：`await openDialog(...).catch(() => null)`。
 *
 * @example
 * const total = await openDialog<number>({
 * 	component: SyncDialog,
 * 	title: '同步 Bangumi',
 * 	dialogProps: { width: '860px' },
 * 	componentProps: { seriesId },
 * });
 */
export function openDialog<T = void>(options: OpenDialogOptions): Promise<T> {
	const container = document.createElement('div');
	document.body.appendChild(container);

	const visible = ref(true);
	const dialogProps = shallowReactive<Record<string, unknown>>({ ...options.dialogProps });
	if (options.title) {
		dialogProps.title = options.title;
	}
	const buttons = shallowReactive<DialogButtonConfig[]>([...(options.buttons ?? [])]);

	/** 调用方声明的可关闭状态：`unclosable()` 之后要能原样恢复 */
	const closableProps = {
		showClose: dialogProps.showClose ?? true,
		closeOnClickModal: dialogProps.closeOnClickModal ?? true,
		closeOnPressEscape: dialogProps.closeOnPressEscape ?? true,
	};

	let app: App | null = null;
	let settled = false;
	let destroyed = false;

	let resolveDialog!: (value: T) => void;
	let rejectDialog!: (error: unknown) => void;
	const result = new Promise<T>((resolve, reject) => {
		resolveDialog = resolve;
		rejectDialog = reject;
	});
	// 取消是正常路径而不是异常：先挂一个空处理器，调用方忘记 catch 时也不会抛未处理拒绝
	void result.catch(() => {});

	const manager = new DialogManager<T>({
		confirm(data) {
			finish(() => resolveDialog(data));
		},
		cancel() {
			finish(() => rejectDialog(new DialogCanceled()));
		},
		setButtons(next) {
			buttons.splice(0, buttons.length, ...next);
		},
		setClosable(closable) {
			Object.assign(
				dialogProps,
				closable ? closableProps : { showClose: false, closeOnClickModal: false, closeOnPressEscape: false },
			);
		},
	});

	/** 只结算一次，然后交给关闭动效收尾：`closed` 事件到达后才卸载应用 */
	function finish(settle: () => void) {
		if (settled) {
			return;
		}
		settled = true;
		settle();
		visible.value = false;
	}

	const closeFromOutside = () => finish(() => rejectDialog(new DialogCanceled()));
	closers.add(closeFromOutside);

	function destroy() {
		if (destroyed) {
			return;
		}
		destroyed = true;
		closers.delete(closeFromOutside);
		if (app) {
			// 先摘掉 Devtools 里这个应用的记录，再卸载：不清缓存的话，
			// 每开一次对话框都会留下一条抓着组件树的记录
			releaseDevtoolsApp(app);
			app.unmount();
			app = null;
		}
		container.remove();
	}

	/** 用户从 X / Esc 关闭时没人调用 confirm/cancel，这里补一次拒绝 */
	function handleClosed() {
		finish(() => rejectDialog(new DialogCanceled()));
		destroy();
	}

	app = createApp({
		render: () =>
			h(DialogHost, {
				visible: visible.value,
				component: options.component,
				componentProps: { dialog: manager, ...options.componentProps },
				dialogProps,
				buttons,
				onClosed: handleClosed,
				'onUpdate:visible': (value: boolean) => {
					visible.value = value;
				},
			}),
	});
	app.use(pinia);
	app.mount(container);

	return result;
}

/** 关闭全部对话框：切页后对话框还挂在 `body` 上会盖住新页面 */
export function closeAllDialogs() {
	for (const close of [...closers]) {
		close();
	}
}
