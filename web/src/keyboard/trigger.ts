import { isFunction } from '@wang-yige/utils';
import { getKeyboardAction, type KeyboardAction } from './action';
import { KeyboardConfig } from './config';
import type { KeyboardInfo } from './types';

const keys = new Map<string, { action: KeyboardAction; info: KeyboardInfo }>();

KeyboardConfig.forEach((item) => {
	item.keys.forEach((key) => {
		keys.set(key.key, { action: item.action, info: key });
	});
});

/**
 * 触发键盘事件
 */
export function triggerKeyboardEvent(e: KeyboardEvent) {
	const code = e.code;
	if (!keys.has(code)) {
		return;
	}
	const { action, info } = keys.get(code)!;
	if (!action) {
		return;
	}
	const { alt = false, ctrl = false, shift = false, meta = false } = info;
	if (alt !== e.altKey || ctrl !== e.ctrlKey || shift !== e.shiftKey || meta !== e.metaKey) {
		return;
	}
	const fn = getKeyboardAction(action);
	if (!isFunction(fn)) {
		return;
	}
	e.stopPropagation();
	e.preventDefault();
	fn();
}
