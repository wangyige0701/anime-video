import type { KeyboardInfo } from './types';
import { KeyboardAction } from './action';

export const KeyboardConfig: Array<{
	action: KeyboardAction;
	keys: KeyboardInfo[];
}> = [
	{
		action: KeyboardAction.PlayPause,
		keys: [{ key: 'Space' }],
	},
	{
		action: KeyboardAction.Shot,
		keys: [{ key: 'KeyS' }],
	},
	{
		action: KeyboardAction.ToggleFullscreen,
		keys: [{ key: 'KeyF' }],
	},
	{
		action: KeyboardAction.VolumeUp,
		keys: [{ key: 'ArrowUp' }],
	},
	{
		action: KeyboardAction.VolumeDown,
		keys: [{ key: 'ArrowDown' }],
	},
];
