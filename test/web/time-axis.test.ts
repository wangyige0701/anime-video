import { describe, expect, it } from 'vitest';
import {
	AXIS_TICK_WIDTH,
	buildMonthAxis,
	fromMonthIndex,
	groupAxisYears,
	isMonthSelected,
	rangeFromIndexes,
	rangeToPixels,
	resolveAxisIndex,
	toMonthIndex,
} from '../../web/src/utils/timeAxis';
import type { SeriesQueryItem } from '../../web/src/utils/seriesQuery';

/** 构造一条最小可用的系列数据，只关心上线时间 */
function createItem(id: string, date: [year?: number, month?: number]): SeriesQueryItem {
	return { id, title: id, description: '', types: [], status: 0, date };
}

describe('月份序号换算', () => {
	it('键与序号可以互相还原', () => {
		expect(toMonthIndex('2024-01')).toBe(2024 * 12);
		expect(fromMonthIndex(2024 * 12)).toBe('2024-01');
		expect(fromMonthIndex(toMonthIndex('2023-12'))).toBe('2023-12');
	});
});

describe('buildMonthAxis', () => {
	it('按最早到最晚补齐连续月份并统计数量', () => {
		const axis = buildMonthAxis([
			createItem('a', [2023, 11]),
			createItem('b', [2024, 2]),
			createItem('c', [2024, 2]),
		]);

		expect(axis.map((item) => item.key)).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
		expect(axis.map((item) => item.count)).toEqual([1, 0, 0, 2]);
		expect(axis[3]).toMatchObject({ year: 2024, month: 2 });
	});

	it('忽略未设置上线时间的条目', () => {
		const axis = buildMonthAxis([createItem('a', [2024, 3]), createItem('b', [])]);
		expect(axis.map((item) => item.key)).toEqual(['2024-03']);
	});

	it('没有任何有效日期时返回空数组', () => {
		expect(buildMonthAxis([])).toEqual([]);
		expect(buildMonthAxis([createItem('a', [])])).toEqual([]);
	});

	it('单个月份只生成一个刻度', () => {
		expect(buildMonthAxis([createItem('a', [2024, 6])])).toHaveLength(1);
	});
});

describe('groupAxisYears', () => {
	it('把连续月份归并为年份并统计跨度', () => {
		const axis = buildMonthAxis([createItem('a', [2023, 11]), createItem('b', [2024, 2])]);
		expect(groupAxisYears(axis)).toEqual([
			{ year: 2023, span: 2 },
			{ year: 2024, span: 2 },
		]);
	});
});

describe('resolveAxisIndex', () => {
	it('根据左边界与刻度宽度换算下标', () => {
		const left = 100;
		expect(resolveAxisIndex(left, left, 10)).toBe(0);
		expect(resolveAxisIndex(left + AXIS_TICK_WIDTH * 2 + 1, left, 10)).toBe(2);
	});

	it('越界时收敛到首尾刻度', () => {
		expect(resolveAxisIndex(0, 100, 10)).toBe(0);
		expect(resolveAxisIndex(100 + AXIS_TICK_WIDTH * 99, 100, 10)).toBe(9);
	});

	it('没有刻度时返回 -1', () => {
		expect(resolveAxisIndex(100, 100, 0)).toBe(-1);
	});
});

describe('rangeFromIndexes', () => {
	const axis = buildMonthAxis([createItem('a', [2024, 1]), createItem('b', [2024, 4])]);

	it('正向拖动按起点到终点生成范围', () => {
		expect(rangeFromIndexes(axis, 0, 2)).toEqual({ from: '2024-01', to: '2024-03' });
	});

	it('反向拖动自动交换，保证 from 早于 to', () => {
		expect(rangeFromIndexes(axis, 3, 1)).toEqual({ from: '2024-02', to: '2024-04' });
	});

	it('起止相同视为选中单月', () => {
		expect(rangeFromIndexes(axis, 2, 2)).toEqual({ from: '2024-03', to: '2024-03' });
	});

	it('下标越界时收敛到首尾刻度', () => {
		expect(rangeFromIndexes(axis, -5, 99)).toEqual({ from: '2024-01', to: '2024-04' });
	});

	it('没有刻度时返回 null', () => {
		expect(rangeFromIndexes([], 0, 1)).toBeNull();
	});
});

describe('rangeToPixels', () => {
	const axis = buildMonthAxis([createItem('a', [2024, 1]), createItem('b', [2024, 6])]);

	it('计算选中区块的位置与宽度', () => {
		expect(rangeToPixels(axis, { from: '2024-02', to: '2024-03' })).toEqual({
			left: AXIS_TICK_WIDTH,
			width: AXIS_TICK_WIDTH * 2,
		});
	});

	it('单月范围宽度等于一个刻度', () => {
		expect(rangeToPixels(axis, { from: '2024-01', to: '2024-01' })).toEqual({
			left: 0,
			width: AXIS_TICK_WIDTH,
		});
	});

	it('未选择或刻度不存在时返回 null', () => {
		expect(rangeToPixels(axis, null)).toBeNull();
		expect(rangeToPixels(axis, { from: '2020-01', to: '2020-02' })).toBeNull();
	});
});

describe('isMonthSelected', () => {
	it('范围内包含两端', () => {
		const range = { from: '2024-02', to: '2024-04' };
		expect(isMonthSelected('2024-02', range)).toBe(true);
		expect(isMonthSelected('2024-04', range)).toBe(true);
		expect(isMonthSelected('2024-05', range)).toBe(false);
	});

	it('未选择时为 false', () => {
		expect(isMonthSelected('2024-02', null)).toBe(false);
	});
});
