import fs from 'node:fs';
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

const THEMES_SCSS = new URL('../../web/src/scss/mixin/themes.scss', import.meta.url);

/** 从 `$themes: ( name: #hex, … )` 里取键值对，样式表是色值的唯一实现来源 */
function readScssThemes() {
	const source = fs.readFileSync(THEMES_SCSS, 'utf8');
	const block = source.match(/\$themes:\s*\(([\s\S]*?)\);/);
	expect(block, 'themes.scss 里找不到 $themes 映射').not.toBeNull();
	return Object.fromEntries([...block![1].matchAll(/([a-z]+)\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

/** WCAG 相对亮度：页面背景是黑与基色的渐变，基色越亮整页越亮 */
function luminance(hex: string) {
	const value = parseInt(hex.slice(1), 16);
	const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
	const linear = (channel: number) => {
		const s = channel / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

describe('主题色板', () => {
	it('scss 的 $themes 与 THEME_OPTIONS 完全一致', () => {
		const scss = readScssThemes();
		const options = Object.fromEntries(THEME_OPTIONS.map((item) => [item.value, item.color.toLowerCase()]));
		expect(scss).toEqual(options);
	});

	it('除星夜紫外都压到同一亮度档，整页仍是暗色', () => {
		// 基准取星空紫：它是用户认可的暗色主题，其余主题的基色亮度不得高出 15%
		const base = luminance('#7b61ff');
		for (const { value, color } of THEME_OPTIONS) {
			if (value === Theme.Xingyezi) continue;
			expect(luminance(color), `${value} 的基色过亮`).toBeLessThanOrEqual(base * 1.15);
		}
	});
});
