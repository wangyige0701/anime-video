import type { Fn } from '@wang-yige/utils';
import mitt from 'mitt';

export enum KeyboardAction {
	/** 播放/暂停 */
	PlayPause = 'playPause',
	/** 上一部 */
	Prev = 'prev',
	/** 下一部 */
	Next = 'next',
	/** 回到开头 */
	BackToStart = 'backToStart',
	/** 音量增大 */
	VolumeUp = 'volumeUp',
	/** 音量减小 */
	VolumeDown = 'volumeDown',
	/** 切换连播状态 */
	ToggleAutoPlay = 'toggleAutoPlay',
	/** 倍速切换 */
	TogglePlaybackRate = 'togglePlaybackRate',
	/** 截屏 */
	Shot = 'shot',
	/** 全屏切换 */
	ToggleFullscreen = 'toggleFullscreen',
}

type BindKeyboardActionEvents = {
	[key in KeyboardAction]: Fn<[], any>;
};

type UnBindKeyboardActionEvents = {
	[key in KeyboardAction]: void;
};

const bindingMap = new Map<KeyboardAction, Fn<[...any[]], any>>();

const bindKeyboardAction = mitt<BindKeyboardActionEvents>();

const unBindKeyboardAction = mitt<UnBindKeyboardActionEvents>();

for (const key in KeyboardAction) {
	const action = KeyboardAction[key as keyof typeof KeyboardAction];
	bindKeyboardAction.on(action, (fn) => {
		bindingMap.set(action, fn);
	});
	unBindKeyboardAction.on(action, () => {
		bindingMap.delete(action);
	});
}

export function useKeyboardAction(key: KeyboardAction, fn: Fn<[...any[]], any>) {
	bindKeyboardAction.emit(key, fn);
	onScopeDispose(() => {
		unBindKeyboardAction.emit(key);
	});
}

export function getKeyboardAction(key: KeyboardAction) {
	return bindingMap.get(key);
}
