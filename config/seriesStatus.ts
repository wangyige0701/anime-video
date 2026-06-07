export const seriesStatus = [
	{
		id: 1,
		name: '全部',
	},
	{
		id: 2,
		name: '连载中',
	},
	{
		id: 3,
		name: '已完结',
	},
	{
		id: 4,
		name: '未放送',
	},
];

export function getSeriesStatusName(id: number) {
	return seriesStatus.find((status) => status.id === id)?.name || '';
}
