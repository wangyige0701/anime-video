import { isFunction } from '@wang-yige/utils';
import { getKeyboardAction, type KeyboardAction } from './action';
import { KeyboardConfig } from './config';

const keys = new Map<string, KeyboardAction>();

KeyboardConfig.forEach((item) => {
	item.keys.forEach((key) => {
		keys.set(key.key, item.action);
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
	const action = keys.get(code);
	if (!action) {
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
