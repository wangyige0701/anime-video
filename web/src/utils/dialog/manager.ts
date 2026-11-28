import type { DialogButtonConfig } from './types';

/**
 * 控制器与宿主之间的接线。
 *
 * 由 `openDialog()` 提供实现，内容组件只拿到 `DialogManager`，
 * 不接触 Promise 的 resolve/reject，也不需要知道对话框是怎么挂载的。
 */
export interface DialogManagerHooks<T> {
	confirm(data: T): void;
	cancel(): void;
	setButtons(buttons: DialogButtonConfig[]): void;
	setClosable(closable: boolean): void;
}

/**
 * 对话框控制器。
 *
 * 内容组件通过 `dialog` 属性拿到它：
 * - `confirm(data)` 让 `openDialog()` 的 Promise resolve，`data` 就是结果；
 * - `cancel()` 让它 reject（`DialogCanceled`）；用户点 X、按 Esc 同样是这条路径；
 * - `setButtons()` 整组替换页脚按钮，两步流程（匹配 → 确认）因此不需要宿主预留业务分支；
 * - `unclosable()` 在请求进行中挡住所有关闭入口，`closable()` 恢复。
 */
export class DialogManager<T = void> {
	private readonly hooks: DialogManagerHooks<T>;

	constructor(hooks: DialogManagerHooks<T>) {
		this.hooks = hooks;
	}

	/** 确认并关闭，`data` 作为 Promise 的结果 */
	confirm(data: T) {
		this.hooks.confirm(data);
	}

	/** 取消并关闭，Promise 以 `DialogCanceled` reject */
	cancel() {
		this.hooks.cancel();
	}

	/** 整组替换页脚按钮，传空数组即清空 */
	setButtons(buttons: DialogButtonConfig[]) {
		this.hooks.setButtons(buttons);
	}

	/** 恢复点击遮罩、Esc、右上角关闭 */
	closable() {
		this.hooks.setClosable(true);
	}

	/** 只允许通过 `confirm` / `cancel` 关闭 */
	unclosable() {
		this.hooks.setClosable(false);
	}
}
