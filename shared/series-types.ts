export const seriesTypes = [
	{
		id: 1,
		name: 'TV',
	},
	{
		id: 2,
		name: '剧场版',
	},
	{
		id: 3,
		name: 'OVA',
	},
	{
		id: 4,
		name: '国产',
	},
	{
		id: 5,
		name: '日本',
	},
	{
		id: 6,
		name: '原创',
	},
	{
		id: 7,
		name: '漫画改',
	},
	{
		id: 8,
		name: '轻改',
	},
	{
		id: 9,
		name: '小说改',
	},
	{
		id: 10,
		name: '游戏改',
	},
	{
		id: 11,
		name: '搞笑',
	},
	{
		id: 12,
		name: '奇幻',
	},
	{
		id: 13,
		name: '冒险',
	},
	{
		id: 14,
		name: '爱情',
	},
	{
		id: 15,
		name: '校园',
	},
	{
		id: 16,
		name: '运动',
	},
	{
		id: 17,
		name: '科幻',
	},
	{
		id: 18,
		name: '悬疑',
	},
	{
		id: 19,
		name: '治愈',
	},
	{
		id: 20,
		name: '异世界',
	},
	{
		id: 21,
		name: '百合',
	},
	{
		id: 22,
		name: '后宫',
	},
	{
		id: 23,
		name: '日常',
	},
	{
		id: 24,
		name: '美少女',
	},
	{
		id: 25,
		name: '魔法少女',
	},
	{
		id: 26,
		name: '战斗',
	},
	{
		id: 27,
		name: '恋爱',
	},
	{
		id: 28,
		name: '萌系',
	},
	{
		id: 29,
		name: '纯爱',
	},
	{
		id: 30,
		name: '节操',
	},
	{
		id: 31,
		name: '泡面番',
	},
	{
		id: 32,
		name: '无厘头',
	},
	{
		id: 33,
		name: '热血',
	},
	{
		id: 34,
		name: '机战',
	},
	{
		id: 35,
		name: '妖怪',
	},
	{
		id: 36,
		name: '推理',
	},
	{
		id: 37,
		name: '恐怖',
	},
	{
		id: 38,
		name: '历史',
	},
	{
		id: 39,
		name: '音乐',
	},
	{
		id: 40,
		name: '偶像',
	},
	{
		id: 41,
		name: '美食',
	},
	{
		id: 42,
		name: '青春',
	},
	{
		id: 43,
		name: '儿童向',
	},
	{
		id: 44,
		name: '致郁',
	},
	{
		id: 45,
		name: '催泪',
	},
];

export function getSeriesTypeName(id: number) {
	return seriesTypes.find((type) => type.id === id)?.name || '';
}
