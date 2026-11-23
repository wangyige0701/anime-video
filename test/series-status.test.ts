import { describe, expect, it } from 'vitest';
import {
	isWritableSeriesStatus,
	getSeriesStatusName,
	writableSeriesStatus,
	seriesStatus,
	SERIES_STATUS_ALL,
} from '~shared/series-status';

describe('系列状态枚举', () => {
	it('筛选枚举保留「全部」选项', () => {
		expect(seriesStatus[0]).toEqual({ id: SERIES_STATUS_ALL, name: '全部' });
		expect(seriesStatus.length).toBe(4);
	});

	it('可写状态排除「全部」，且保持原有顺序', () => {
		expect(writableSeriesStatus.map((item) => item.id)).toEqual([2, 3, 4]);
		expect(writableSeriesStatus.some((item) => item.name === '全部')).toBe(false);
	});

	it('「全部」不能作为系列状态写入', () => {
		expect(isWritableSeriesStatus(SERIES_STATUS_ALL)).toBe(false);
	});

	it('已定义的状态都可以写入', () => {
		for (const item of writableSeriesStatus) {
			expect(isWritableSeriesStatus(item.id)).toBe(true);
		}
	});

	it('未定义、未设置与非法数字都不可写入', () => {
		expect(isWritableSeriesStatus(0)).toBe(false);
		expect(isWritableSeriesStatus(5)).toBe(false);
		expect(isWritableSeriesStatus(-1)).toBe(false);
		expect(isWritableSeriesStatus(2.5)).toBe(false);
		expect(isWritableSeriesStatus(Number.NaN)).toBe(false);
	});

	it('名称查询只认可写状态，「全部」与未知状态都返回空串', () => {
		expect(getSeriesStatusName(2)).toBe('连载中');
		expect(getSeriesStatusName(4)).toBe('未放送');
		expect(getSeriesStatusName(SERIES_STATUS_ALL)).toBe('');
		expect(getSeriesStatusName(0)).toBe('');
		expect(getSeriesStatusName(99)).toBe('');
	});
});
