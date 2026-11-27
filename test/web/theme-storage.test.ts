import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS, Theme } from '../../web/src/config/theme';
import { parseTheme } from '../../web/src/utils/themeStorage';

describe('parseTheme', () => {
	it('接受枚举内的主题名', () => {
		expect(parseTheme('xingyezi')).toBe(Theme.Xingyezi);
		expect(parseTheme('shenhailan')).toBe(Theme.Shenhailan);
		expect(parseTheme('riluocheng')).toBe(Theme.Riluocheng);
	});

	it('空值回落到 null', () => {
		expect(parseTheme(null)).toBeNull();
		expect(parseTheme(undefined)).toBeNull();
		expect(parseTheme('')).toBeNull();
	});

	it('未知值与大小写变体都不接受', () => {
		// class 名是小写枚举值，`Xingyezi` 挂不到根节点上会得到一套没有任何样式的配色
		expect(parseTheme('Xingyezi')).toBeNull();
		expect(parseTheme('default')).toBeNull();
		expect(parseTheme('xingyezi ')).toBeNull();
		expect(parseTheme('{"theme":"xingyezi"}')).toBeNull();
	});
});

describe('THEME_OPTIONS', () => {
	it('覆盖全部主题且不重复', () => {
		const values = THEME_OPTIONS.map((item) => item.value);
		expect([...values].sort()).toEqual(Object.values(Theme).sort());
		expect(new Set(values).size).toBe(values.length);
	});

	it('每项都有可渲染的色值与文案', () => {
		for (const item of THEME_OPTIONS) {
			expect(item.label.trim()).not.toBe('');
			expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});
