import { isString } from '@wang-yige/utils';
import type { KeyboardAction } from './action';
import { KeyboardConfig } from './config';

const keyboardKeyTextMap = new Map<string, string>([
	// 主键盘区
	['Backquote', '`'],
	['Backslash', '\\'],
	['BracketLeft', '['],
	['BracketRight', ']'],
	['Comma', ','],
	['Digit0', '0'],
	['Digit1', '1'],
	['Digit2', '2'],
	['Digit3', '3'],
	['Digit4', '4'],
	['Digit5', '5'],
	['Digit6', '6'],
	['Digit7', '7'],
	['Digit8', '8'],
	['Digit9', '9'],
	['Equal', '='],
	['IntlBackslash', '\\'],
	['IntlRo', 'Ro'],
	['IntlYen', 'Yen'],
	['KeyA', 'A'],
	['KeyB', 'B'],
	['KeyC', 'C'],
	['KeyD', 'D'],
	['KeyE', 'E'],
	['KeyF', 'F'],
	['KeyG', 'G'],
	['KeyH', 'H'],
	['KeyI', 'I'],
	['KeyJ', 'J'],
	['KeyK', 'K'],
	['KeyL', 'L'],
	['KeyM', 'M'],
	['KeyN', 'N'],
	['KeyO', 'O'],
	['KeyP', 'P'],
	['KeyQ', 'Q'],
	['KeyR', 'R'],
	['KeyS', 'S'],
	['KeyT', 'T'],
	['KeyU', 'U'],
	['KeyV', 'V'],
	['KeyW', 'W'],
	['KeyX', 'X'],
	['KeyY', 'Y'],
	['KeyZ', 'Z'],
	['Minus', '-'],
	['Period', '.'],
	['Quote', "'"],
	['Semicolon', ';'],
	['Slash', '/'],
	['Space', 'Space'],
	[' ', 'Space'],
	['Spacebar', 'Space'],

	// 修饰键、导航键与编辑键
	['Alt', 'Alt'],
	['AltGraph', 'AltGr'],
	['AltLeft', 'Alt'],
	['AltRight', 'Alt'],
	['ArrowDown', 'Down'],
	['ArrowLeft', 'Left'],
	['ArrowRight', 'Right'],
	['ArrowUp', 'Up'],
	['Backspace', 'Backspace'],
	['CapsLock', 'Caps Lock'],
	['ContextMenu', 'Menu'],
	['Control', 'Ctrl'],
	['ControlLeft', 'Ctrl'],
	['ControlRight', 'Ctrl'],
	['Delete', 'Delete'],
	['End', 'End'],
	['Enter', 'Enter'],
	['Escape', 'Esc'],
	['Esc', 'Esc'],
	['Home', 'Home'],
	['Insert', 'Insert'],
	['Meta', 'Meta'],
	['MetaLeft', 'Meta'],
	['MetaRight', 'Meta'],
	['OS', 'Meta'],
	['PageDown', 'Page Down'],
	['PageUp', 'Page Up'],
	['Shift', 'Shift'],
	['ShiftLeft', 'Shift'],
	['ShiftRight', 'Shift'],
	['Tab', 'Tab'],

	// 小键盘
	['NumLock', 'Num Lock'],
	['Numpad0', 'Num 0'],
	['Numpad1', 'Num 1'],
	['Numpad2', 'Num 2'],
	['Numpad3', 'Num 3'],
	['Numpad4', 'Num 4'],
	['Numpad5', 'Num 5'],
	['Numpad6', 'Num 6'],
	['Numpad7', 'Num 7'],
	['Numpad8', 'Num 8'],
	['Numpad9', 'Num 9'],
	['NumpadAdd', 'Num +'],
	['NumpadBackspace', 'Num Backspace'],
	['NumpadClear', 'Num Clear'],
	['NumpadClearEntry', 'Num CE'],
	['NumpadComma', 'Num ,'],
	['NumpadDecimal', 'Num .'],
	['NumpadDivide', 'Num /'],
	['NumpadEnter', 'Num Enter'],
	['NumpadEqual', 'Num ='],
	['NumpadHash', 'Num #'],
	['NumpadMemoryAdd', 'Num M+'],
	['NumpadMemoryClear', 'Num MC'],
	['NumpadMemoryRecall', 'Num MR'],
	['NumpadMemoryStore', 'Num MS'],
	['NumpadMemorySubtract', 'Num M-'],
	['NumpadMultiply', 'Num *'],
	['NumpadParenLeft', 'Num ('],
	['NumpadParenRight', 'Num )'],
	['NumpadStar', 'Num *'],
	['NumpadSubtract', 'Num -'],

	// 功能键与系统键
	['Fn', 'Fn'],
	['FnLock', 'Fn Lock'],
	['Help', 'Help'],
	['Pause', 'Pause'],
	['PrintScreen', 'Print Screen'],
	['ScrollLock', 'Scroll Lock'],
	['Sleep', 'Sleep'],
	['WakeUp', 'Wake Up'],
	['Power', 'Power'],
	['Eject', 'Eject'],

	// 输入法与语言键
	['Convert', 'Convert'],
	['KanaMode', 'Kana'],
	['Lang1', 'Lang 1'],
	['Lang2', 'Lang 2'],
	['Lang3', 'Lang 3'],
	['Lang4', 'Lang 4'],
	['Lang5', 'Lang 5'],
	['NonConvert', 'Non-convert'],

	// 浏览器、应用与媒体键
	['AudioVolumeDown', 'Volume Down'],
	['AudioVolumeMute', 'Mute'],
	['AudioVolumeUp', 'Volume Up'],
	['BrowserBack', 'Browser Back'],
	['BrowserFavorites', 'Browser Favorites'],
	['BrowserForward', 'Browser Forward'],
	['BrowserHome', 'Browser Home'],
	['BrowserRefresh', 'Browser Refresh'],
	['BrowserSearch', 'Browser Search'],
	['BrowserStop', 'Browser Stop'],
	['LaunchApp1', 'App 1'],
	['LaunchApp2', 'App 2'],
	['LaunchMail', 'Mail'],
	['MediaPlayPause', 'Play/Pause'],
	['MediaSelect', 'Media'],
	['MediaStop', 'Stop'],
	['MediaTrackNext', 'Next Track'],
	['MediaTrackPrevious', 'Previous Track'],
]);

for (let index = 1; index <= 35; index += 1) {
	keyboardKeyTextMap.set(`F${index}`, `F${index}`);
}

/**
 * 将 KeyboardEvent.code 或 KeyboardEvent.key 转为适合展示的按键文本。
 * @param key 要转换的按键。
 */
export function getKeyboardKeyText(key: string | string[], template = ' ($key)', separator = '/') {
	if (isString(key)) {
		key = [key];
	}
	const keyTexts = key.map((k) => keyboardKeyTextMap.get(k) ?? k).filter(Boolean);
	if (!keyTexts.length) {
		return '';
	}
	return template.replaceAll('$key', keyTexts.join(separator));
}

/**
 * 将 KeyboardAction 转为适合展示的按键文本。
 * @param key 要转换的 KeyboardAction
 */
export function getKeyboradActionText(key: KeyboardAction) {
	const actions = KeyboardConfig.find((k) => k.action === key);
	return getKeyboardKeyText(actions?.keys.map((k) => k.key) || []);
}
