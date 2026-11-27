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
 * 的 `$themes` 保持一致，改主题色时两处同时改。
 */
export const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; color: string }> = [
	{ value: Theme.Xingyezi, label: '星夜紫', color: '#7b61ff' },
	{ value: Theme.Shenhailan, label: '深海蓝', color: '#4a90e2' },
	{ value: Theme.Boheqing, label: '薄荷青', color: '#21c7ab' },
	{ value: Theme.Yinghuafen, label: '樱花粉', color: '#ff6fa7' },
	{ value: Theme.Riluocheng, label: '日落橙', color: '#ff9e4d' },
];
