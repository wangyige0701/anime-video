import { describe, expect, it } from 'vitest';
import {
	seriesDateSchema,
	seriesDescriptionSchema,
	seriesStatusSchema,
	seriesTitleSchema,
} from '~server/src/schema/series-fields';

describe('系列字段写入参数', () => {
	it('标题去掉首尾空白后原样保留', () => {
		const result = seriesTitleSchema.safeParse({ title: '  某系列  ' });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ title: '某系列' });
	});

	it('空标题与纯空白标题是合法输入，交由数据层还原默认标题', () => {
		const empty = seriesTitleSchema.safeParse({ title: '' });
		expect(empty.success).toBe(true);
		expect(empty.data).toEqual({ title: '' });
		const blank = seriesTitleSchema.safeParse({ title: '   ' });
		expect(blank.success).toBe(true);
		expect(blank.data).toEqual({ title: '' });
	});

	it('标题缺失或非字符串仍然被拒绝', () => {
		expect(seriesTitleSchema.safeParse({ title: 123 }).success).toBe(false);
		expect(seriesTitleSchema.safeParse({}).success).toBe(false);
	});

	it('描述允许空串并去掉首尾空白', () => {
		expect(seriesDescriptionSchema.safeParse({ description: '' }).success).toBe(true);
		const result = seriesDescriptionSchema.safeParse({ description: '  简介\n' });
		expect(result.data).toEqual({ description: '简介' });
		expect(seriesDescriptionSchema.safeParse({ description: null }).success).toBe(false);
	});

	it('日期接受 1900 与 9999 边界值', () => {
		expect(seriesDateSchema.safeParse({ year: 1900, month: 1 }).success).toBe(true);
		expect(seriesDateSchema.safeParse({ year: 9999, month: 12 }).success).toBe(true);
	});

	it('日期拒绝越界年份与月份', () => {
		expect(seriesDateSchema.safeParse({ year: 1899, month: 1 }).success).toBe(false);
		expect(seriesDateSchema.safeParse({ year: 10000, month: 1 }).success).toBe(false);
		expect(seriesDateSchema.safeParse({ year: 2024, month: 0 }).success).toBe(false);
		expect(seriesDateSchema.safeParse({ year: 2024, month: 13 }).success).toBe(false);
	});

	it('日期拒绝非整数与缺失字段', () => {
		expect(seriesDateSchema.safeParse({ year: 2024, month: 1.5 }).success).toBe(false);
		expect(seriesDateSchema.safeParse({ year: '2024', month: 1 }).success).toBe(false);
		expect(seriesDateSchema.safeParse({ year: 2024 }).success).toBe(false);
	});

	it('状态只接受可写状态值', () => {
		expect(seriesStatusSchema.safeParse({ status: 2 }).success).toBe(true);
		expect(seriesStatusSchema.safeParse({ status: 4 }).success).toBe(true);
		// 「全部」是筛选哨兵，0 表示未设置，都不该通过写入校验
		expect(seriesStatusSchema.safeParse({ status: 1 }).success).toBe(false);
		expect(seriesStatusSchema.safeParse({ status: 0 }).success).toBe(false);
		expect(seriesStatusSchema.safeParse({ status: 5 }).success).toBe(false);
		expect(seriesStatusSchema.safeParse({ status: 2.5 }).success).toBe(false);
	});
});
