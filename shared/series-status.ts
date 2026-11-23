/**
 * 状态筛选里的「全部」选项。
 *
 * 它只表示「不按状态过滤」，不是系列自身的状态，接口层不接受该值写入配置。
 */
export const SERIES_STATUS_ALL = 1;

export const seriesStatus = [
	{
		id: SERIES_STATUS_ALL,
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

/**
 * 可作为系列状态写入配置的选项。
 *
 * 过滤掉「全部」这类筛选哨兵。接口校验与前端选择器都用它，
 * 避免「接口允许存入并不存在的状态」与「前端各自用 id > 1 隐式过滤」两套规则并存。
 */
export const writableSeriesStatus = seriesStatus.filter((status) => status.id !== SERIES_STATUS_ALL);

export function isWritableSeriesStatus(id: number) {
	return writableSeriesStatus.some((status) => status.id === id);
}

/** 系列自身的状态名；「全部」不是状态，查询结果为空串 */
export function getSeriesStatusName(id: number) {
	return writableSeriesStatus.find((status) => status.id === id)?.name || '';
}
