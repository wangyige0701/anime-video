import { KeyboardAction } from './action';

export const KeyboardConfig: Array<{ action: KeyboardAction; keys: { key: string }[] }> = [
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
