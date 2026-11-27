export enum Theme {
	Xingyezi = 'xingyezi',
	Shenhailan = 'shenhailan',
	Boheqing = 'boheqing',
	Yinghuafen = 'yinghuafen',
	Riluocheng = 'riluocheng',
}

/**
 * 主题的展示信息。
 *
 * 设置页的外观分组直接读这份列表渲染色板；`color` 必须与 `scss/mixin/themes.scss`
 * 的 `$themes` 保持一致，改主题色时两处同时改（`test/web/theme-storage.test.ts` 会比对）。
 */
export const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; color: string }> = [
	{ value: Theme.Xingyezi, label: '星夜紫', color: '#7b61ff' },
	{ value: Theme.Shenhailan, label: '深海蓝', color: '#2f7ac9' },
	{ value: Theme.Boheqing, label: '薄荷青', color: '#1a8f7d' },
	{ value: Theme.Yinghuafen, label: '樱花粉', color: '#cc4a80' },
	{ value: Theme.Riluocheng, label: '日落橙', color: '#c26a22' },
];
