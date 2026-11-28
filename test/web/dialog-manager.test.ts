import { describe, expect, it, vi } from 'vitest';
import { DialogManager } from '../../web/src/utils/dialog/manager';

function createManager<T = void>() {
	const hooks = {
		confirm: vi.fn(),
		cancel: vi.fn(),
		setButtons: vi.fn(),
		setClosable: vi.fn(),
	};
	return { hooks, manager: new DialogManager<T>(hooks) };
}

describe('DialogManager', () => {
	it('confirm 把结果原样交给宿主', () => {
		const { hooks, manager } = createManager<number>();
		manager.confirm(8);
		expect(hooks.confirm).toHaveBeenCalledWith(8);
	});

	it('无结果的对话框可以不传参数', () => {
		const { hooks, manager } = createManager();
		manager.confirm();
		expect(hooks.confirm).toHaveBeenCalledTimes(1);
		expect(hooks.confirm.mock.calls[0][0]).toBeUndefined();
	});

	it('cancel 与 confirm 走不同分支', () => {
		const { hooks, manager } = createManager<number>();
		manager.cancel();
		expect(hooks.cancel).toHaveBeenCalledTimes(1);
		expect(hooks.confirm).not.toHaveBeenCalled();
	});

	it('setButtons 整组替换页脚按钮', () => {
		const { hooks, manager } = createManager();
		const buttons = [
			{ key: 'cancel', content: '取消' },
			{ key: 'apply', content: '应用 3 项', type: 'primary' as const },
		];
		manager.setButtons(buttons);
		expect(hooks.setButtons).toHaveBeenCalledWith(buttons);
	});

	it('closable / unclosable 映射到同一开关', () => {
		const { hooks, manager } = createManager();
		manager.unclosable();
		manager.closable();
		expect(hooks.setClosable.mock.calls).toEqual([[false], [true]]);
	});
});
