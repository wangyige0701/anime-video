import { describe, expect, it } from 'vitest';
import { getSeriesTypeName, seriesTypes } from '~shared/series-types';

describe('系列类型枚举', () => {
	// 服务端用首尾 id 组成合法区间做写入校验，id 必须从 1 连续递增
	it('类型 ID 从 1 开始连续递增', () => {
		expect(seriesTypes.map((type) => type.id)).toEqual(seriesTypes.map((_, index) => index + 1));
	});

	it('列表末尾是纯爱、节操等新增标签与补充题材', () => {
		expect(seriesTypes.slice(-17).map((type) => type.name)).toEqual([
			'纯爱',
			'节操',
			'泡面番',
			'无厘头',
			'热血',
			'机战',
			'妖怪',
			'推理',
			'恐怖',
			'历史',
			'音乐',
			'偶像',
			'美食',
			'青春',
			'儿童向',
			'致郁',
			'催泪',
		]);
	});

	it('类型名称唯一且非空', () => {
		const names = seriesTypes.map((type) => type.name);
		expect(new Set(names).size).toBe(names.length);
		expect(names.every((name) => name.trim().length > 0)).toBe(true);
	});

	it('名称查询返回对应名称，未知 ID 返回空串', () => {
		expect(getSeriesTypeName(1)).toBe('TV');
		expect(getSeriesTypeName(23)).toBe('日常');
		expect(getSeriesTypeName(28)).toBe('萌系');
		expect(getSeriesTypeName(29)).toBe('纯爱');
		expect(getSeriesTypeName(45)).toBe('催泪');
		expect(getSeriesTypeName(0)).toBe('');
		expect(getSeriesTypeName(46)).toBe('');
		expect(getSeriesTypeName(99)).toBe('');
	});
});
