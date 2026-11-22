import { describe, expect, it } from 'vitest';
import {
	applySeriesQuery,
	createDefaultSeriesQuery,
	EMPTY_MONTH_LABEL,
	formatMonthLabel,
	groupSeriesByMonth,
	matchesDateRange,
	normalizeDateRange,
	paginateSeries,
	sortSeriesList,
	toMonthKey,
	type SeriesQueryItem,
} from '../../web/src/utils/seriesQuery';

/** 构造一条最小可用的系列数据，未指定的字段使用中性默认值 */
function createItem(overrides: Partial<SeriesQueryItem> & { id: string }): SeriesQueryItem {
	return {
		title: overrides.id,
		description: '',
		types: [],
		status: 0,
		date: [],
		...overrides,
	};
}

describe('toMonthKey', () => {
	it('把合法的年月转换为 YYYY-MM', () => {
		expect(toMonthKey([2024, 4])).toBe('2024-04');
		expect(toMonthKey([2024, 12])).toBe('2024-12');
	});

	it('缺少或非法的年月返回 null', () => {
		expect(toMonthKey()).toBeNull();
		expect(toMonthKey([])).toBeNull();
		expect(toMonthKey([2024])).toBeNull();
		expect(toMonthKey([2024, 0])).toBeNull();
		expect(toMonthKey([2024, 13])).toBeNull();
		expect(toMonthKey([0, 5])).toBeNull();
		expect(toMonthKey([2024.5, 5])).toBeNull();
	});
});

describe('formatMonthLabel', () => {
	it('输出中文年月文案', () => {
		expect(formatMonthLabel('2024-04')).toBe('2024 年 4 月');
		expect(formatMonthLabel('2023-12')).toBe('2023 年 12 月');
	});

	it('空键表示未设置上线时间', () => {
		expect(formatMonthLabel('')).toBe(EMPTY_MONTH_LABEL);
	});

	it('无法解析的键原样返回', () => {
		expect(formatMonthLabel('unknown')).toBe('unknown');
	});
});

describe('normalizeDateRange', () => {
	it('起止顺序颠倒时自动交换', () => {
		expect(normalizeDateRange({ from: '2024-06', to: '2024-01' })).toEqual({
			from: '2024-01',
			to: '2024-06',
		});
	});

	it('空范围或非法键返回 null', () => {
		expect(normalizeDateRange(null)).toBeNull();
		expect(normalizeDateRange({ from: '', to: '2024-01' })).toBeNull();
		expect(normalizeDateRange({ from: '2024-1', to: '2024-02' })).toBeNull();
		expect(normalizeDateRange({ from: '2024-13', to: '2024-14' })).toBeNull();
	});
});

describe('matchesDateRange', () => {
	const range = { from: '2023-06', to: '2024-02' };

	it('未设置范围时全部放行', () => {
		expect(matchesDateRange(createItem({ id: 'a', date: [] }), null)).toBe(true);
	});

	it('范围两端都包含', () => {
		expect(matchesDateRange(createItem({ id: 'a', date: [2023, 6] }), range)).toBe(true);
		expect(matchesDateRange(createItem({ id: 'b', date: [2024, 2] }), range)).toBe(true);
	});

	it('范围外与未设置上线时间的条目被排除', () => {
		expect(matchesDateRange(createItem({ id: 'a', date: [2023, 5] }), range)).toBe(false);
		expect(matchesDateRange(createItem({ id: 'b', date: [2024, 3] }), range)).toBe(false);
		expect(matchesDateRange(createItem({ id: 'c', date: [] }), range)).toBe(false);
	});
});

describe('sortSeriesList', () => {
	const list = [
		createItem({ id: 'old', title: 'B', date: [2020, 1] }),
		createItem({ id: 'new-b', title: 'C', date: [2024, 5] }),
		createItem({ id: 'new-a', title: 'A', date: [2024, 5] }),
		createItem({ id: 'none', title: 'D', date: [] }),
	];

	it('按上线时间倒序，同月内按名称升序，无日期排最后', () => {
		expect(sortSeriesList(list, 'date').map((item) => item.id)).toEqual(['new-a', 'new-b', 'old', 'none']);
	});

	it('按名称排序时忽略上线时间', () => {
		expect(sortSeriesList(list, 'name').map((item) => item.id)).toEqual(['new-a', 'old', 'new-b', 'none']);
	});

	it('不修改入参顺序', () => {
		const source = [...list];
		sortSeriesList(source, 'date');
		expect(source.map((item) => item.id)).toEqual(list.map((item) => item.id));
	});

	it('数字按数值大小比较，避免第 10 集排在第 2 集之前', () => {
		const items = [
			createItem({ id: 'ep10', title: '第 10 集', date: [2024, 1] }),
			createItem({ id: 'ep2', title: '第 2 集', date: [2024, 1] }),
		];
		expect(sortSeriesList(items, 'name').map((item) => item.id)).toEqual(['ep2', 'ep10']);
	});
});

describe('applySeriesQuery', () => {
	const list = [
		createItem({
			id: 'a',
			title: 'Alpha',
			description: '校园故事',
			types: [1, 11],
			status: 2,
			date: [2024, 4],
		}),
		createItem({
			id: 'b',
			title: 'Beta',
			description: '奇幻冒险',
			types: [2],
			status: 3,
			date: [2023, 1],
		}),
		createItem({ id: 'c', title: 'Gamma', description: '', types: [1], status: 0, date: [] }),
	];

	it('默认条件只做上线时间排序', () => {
		expect(applySeriesQuery(list, '', createDefaultSeriesQuery()).map((item) => item.id)).toEqual(['a', 'b', 'c']);
	});

	it('关键词同时匹配标题与描述，且大小写不敏感', () => {
		expect(applySeriesQuery(list, 'beta').map((item) => item.id)).toEqual(['b']);
		expect(applySeriesQuery(list, '冒险').map((item) => item.id)).toEqual(['b']);
		expect(applySeriesQuery(list, '  Alpha  ').map((item) => item.id)).toEqual(['a']);
	});

	it('标签过滤命中任一选中标签即保留', () => {
		expect(applySeriesQuery(list, '', { types: [11] }).map((item) => item.id)).toEqual(['a']);
		expect(applySeriesQuery(list, '', { types: [1] }).map((item) => item.id)).toEqual(['a', 'c']);
	});

	it('状态过滤按 ID 精确匹配', () => {
		expect(applySeriesQuery(list, '', { statuses: [3] }).map((item) => item.id)).toEqual(['b']);
	});

	it('时间范围过滤与未设置上线时间的条目互斥', () => {
		expect(
			applySeriesQuery(list, '', { dateRange: { from: '2023-01', to: '2023-12' } }).map((item) => item.id),
		).toEqual(['b']);
	});

	it('多个条件之间是「与」关系', () => {
		expect(applySeriesQuery(list, 'a', { types: [1], statuses: [2] }).map((item) => item.id)).toEqual(['a']);
		// 关键词命中 a，但状态不符，结果为空
		expect(applySeriesQuery(list, 'alpha', { statuses: [3] })).toEqual([]);
	});

	it('未提供条件时等价于默认查询', () => {
		expect(applySeriesQuery(list).map((item) => item.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('paginateSeries', () => {
	const list = [1, 2, 3, 4, 5];

	it('按页码切片', () => {
		expect(paginateSeries(list, 1, 2)).toEqual([1, 2]);
		expect(paginateSeries(list, 2, 2)).toEqual([3, 4]);
		expect(paginateSeries(list, 3, 2)).toEqual([5]);
	});

	it('超出范围返回空数组', () => {
		expect(paginateSeries(list, 9, 2)).toEqual([]);
	});

	it('非法页码回退到第一页', () => {
		expect(paginateSeries(list, 0, 2)).toEqual([1, 2]);
		expect(paginateSeries(list, Number.NaN, 2)).toEqual([1, 2]);
	});
});

describe('groupSeriesByMonth', () => {
	it('按已排序列表分组并统计数量', () => {
		const list = sortSeriesList(
			[
				createItem({ id: 'a', title: 'B', date: [2024, 5] }),
				createItem({ id: 'b', title: 'A', date: [2024, 5] }),
				createItem({ id: 'c', title: 'C', date: [2024, 4] }),
				createItem({ id: 'd', title: 'D', date: [] }),
			],
			'date',
		);

		const groups = groupSeriesByMonth(list);

		expect(groups.map((group) => group.key)).toEqual(['2024-05', '2024-04', '']);
		expect(groups.map((group) => group.label)).toEqual(['2024 年 5 月', '2024 年 4 月', EMPTY_MONTH_LABEL]);
		expect(groups[0].items.map((item) => item.id)).toEqual(['b', 'a']);
		expect(groups[2].items).toHaveLength(1);
	});

	it('空列表返回空分组', () => {
		expect(groupSeriesByMonth([])).toEqual([]);
	});
});
