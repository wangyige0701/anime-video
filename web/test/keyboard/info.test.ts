import { describe, expect, it } from 'vitest';
import { getKeyboardKeyText } from '../../src/keyboard/info';

describe('getKeyboardKeyText', () => {
	it('formats physical keyboard codes with the default template', () => {
		expect(getKeyboardKeyText('Space')).toBe('(Space)');
		expect(getKeyboardKeyText('KeyS')).toBe('(S)');
		expect(getKeyboardKeyText('NumpadAdd')).toBe('(Num +)');
	});

	it('accepts KeyboardEvent.key values and preserves unknown keys', () => {
		expect(getKeyboardKeyText(' ')).toBe('(Space)');
		expect(getKeyboardKeyText('ArrowUp')).toBe('(Up)');
		expect(getKeyboardKeyText('Unidentified')).toBe('(Unidentified)');
	});

	it('replaces every key placeholder in a custom template', () => {
		expect(getKeyboardKeyText('ControlLeft', '$key + $key')).toBe('Ctrl + Ctrl');
		expect(getKeyboardKeyText('KeyF', '快捷键：[$key]')).toBe('快捷键：[F]');
	});
});
