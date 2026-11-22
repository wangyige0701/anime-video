import { describe, expect, it } from 'vitest';
import {
	AXIS_TICK_WIDTH,
	buildMonthAxis,
	clampAxisWindow,
	formatAxisRange,
	formatAxisWindow,
	fromMonthIndex,
	groupAxisYears,
	initialAxisWindow,
	isMonthSelected,
	panAxisWindow,
	rangeFromIndexes,
	rangeToBand,
	resolveAxisIndex,
	toMonthIndex,
	zoomAxisWindow,
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

describe('clampAxisWindow', () => {
	it('数量与起点越界时收敛到有效范围', () => {
		expect(clampAxisWindow({ start: -5, count: 100 }, 10)).toEqual({ start: 0, count: 10 });
		expect(clampAxisWindow({ start: 8, count: 4 }, 10)).toEqual({ start: 6, count: 4 });
	});

	it('尚未初始化时回退为全量', () => {
		expect(clampAxisWindow({ start: 0, count: 0 }, 12)).toEqual({ start: 0, count: 12 });
	});

	it('空轴返回空窗口', () => {
		expect(clampAxisWindow({ start: 0, count: 5 }, 0)).toEqual({ start: 0, count: 0 });
	});
});

describe('initialAxisWindow', () => {
	// 2023-01 至 2024-12，共 24 个月
	const axis = buildMonthAxis([createItem('a', [2023, 1]), createItem('b', [2024, 12])]);

	it('默认按 34px 折算数量并贴住最右侧', () => {
		expect(initialAxisWindow(axis, 340, null)).toEqual({ start: 14, count: 10 });
	});

	it('已有选中范围时把范围居中，便于直接看到筛选位置', () => {
		const window = initialAxisWindow(axis, 340, { from: '2024-06', to: '2024-07' });
		expect(window.count).toBe(10);
		expect(window.start).toBe(13);
	});

	it('可视区很窄时至少保留最小月份数量', () => {
		expect(initialAxisWindow(axis, 34, null).count).toBe(6);
	});

	it('轴为空或宽度未测量时返回空窗口', () => {
		expect(initialAxisWindow([], 340, null)).toEqual({ start: 0, count: 0 });
		expect(initialAxisWindow(axis, 0, null)).toEqual({ start: 0, count: 0 });
	});
});

describe('zoomAxisWindow', () => {
	const window = { start: 0, count: 24 };

	it('放大后锚点前后的相对位置保持不变', () => {
		expect(zoomAxisWindow(window, 0.5, 12, 24)).toEqual({ start: 6, count: 12 });
	});

	it('缩小不会超过完整轴', () => {
		expect(zoomAxisWindow({ start: 6, count: 12 }, 2, 12, 24)).toEqual({ start: 0, count: 24 });
	});

	it('放大到最小可见数量后不再变化', () => {
		expect(zoomAxisWindow({ start: 0, count: 6 }, 0.5, 3, 24)).toEqual({ start: 0, count: 6 });
	});

	it('非法缩放系数只做窗口收敛', () => {
		expect(zoomAxisWindow(window, 0, 12, 24)).toEqual(window);
		expect(zoomAxisWindow({ start: 21, count: 4 }, Number.NaN, 12, 24)).toEqual({ start: 20, count: 4 });
	});
});

describe('panAxisWindow', () => {
	it('平移后贴住两端，不会滑出数据范围', () => {
		expect(panAxisWindow({ start: 0, count: 10 }, -3, 24)).toEqual({ start: 0, count: 10 });
		expect(panAxisWindow({ start: 0, count: 10 }, 30, 24)).toEqual({ start: 14, count: 10 });
		expect(panAxisWindow({ start: 5, count: 10 }, 3, 24)).toEqual({ start: 8, count: 10 });
	});
});

describe('rangeToBand', () => {
	const axis = buildMonthAxis([createItem('a', [2024, 1]), createItem('b', [2024, 12])]);

	it('按百分比计算色块位置', () => {
		const band = rangeToBand(axis, { start: 0, count: 12 }, { from: '2024-02', to: '2024-03' });
		expect(band?.left).toBeCloseTo((1 / 12) * 100, 6);
		expect(band?.width).toBeCloseTo((2 / 12) * 100, 6);
	});

	it('范围超出窗口时裁剪到窗口边缘', () => {
		const band = rangeToBand(axis, { start: 4, count: 4 }, { from: '2024-01', to: '2024-06' });
		expect(band).toEqual({ left: 0, width: 50 });
	});

	it('完全落在窗口外时返回 null', () => {
		expect(rangeToBand(axis, { start: 4, count: 4 }, { from: '2024-01', to: '2024-02' })).toBeNull();
	});

	it('未选择或刻度不存在时返回 null', () => {
		expect(rangeToBand(axis, { start: 0, count: 12 }, null)).toBeNull();
		expect(rangeToBand(axis, { start: 0, count: 12 }, { from: '2020-01', to: '2020-02' })).toBeNull();
	});
});

describe('时间轴文案', () => {
	it('单月范围只显示一个月份', () => {
		expect(formatAxisRange({ from: '2024-03', to: '2024-03' })).toBe('2024-03');
		expect(formatAxisRange({ from: '2024-03', to: '2024-05' })).toBe('2024-03 ~ 2024-05');
		expect(formatAxisRange(null, '全部时间')).toBe('全部时间');
	});

	it('窗口文案取两端月份', () => {
		const axis = buildMonthAxis([createItem('a', [2024, 1]), createItem('b', [2024, 12])]);
		expect(formatAxisWindow(axis, { start: 2, count: 4 })).toBe('2024-03 ~ 2024-06');
		expect(formatAxisWindow(axis, { start: 0, count: 1 })).toBe('2024-01');
		expect(formatAxisWindow([], { start: 0, count: 0 })).toBe('');
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
