import { describe, expect, it } from 'vitest';
import { mergedImageOrderSchema, mergedSeasonOrderSchema, seriesMergeSchema } from '~server/src/schema/series-merge';

/**
 * 合并参数只做形状校验：主系列由路径参数给定，关系约束在数据层判断。
 * 这里只需要保证空 id 与纯空白不会被当成合法成员。
 */
describe('seriesMergeSchema', () => {
	it('接受非空 id 并去除首尾空白', () => {
		expect(seriesMergeSchema.parse({ memberId: ' abc ' })).toEqual({ memberId: 'abc' });
	});

	it('拒绝空字符串', () => {
		expect(seriesMergeSchema.safeParse({ memberId: '' }).success).toBe(false);
	});

	it('拒绝纯空白', () => {
		expect(seriesMergeSchema.safeParse({ memberId: '   ' }).success).toBe(false);
	});

	it('拒绝缺少字段', () => {
		expect(seriesMergeSchema.safeParse({}).success).toBe(false);
	});
});

/**
 * 合并组顺序的两个参数模式只校验数组形状：是否属于当前合并组依赖实例，
 * 由数据层判断；空数组合法，表示清空显式顺序、回到默认顺序。
 */
describe('mergedSeasonOrderSchema', () => {
	it('接受季 id 数组并去除首尾空白', () => {
		expect(mergedSeasonOrderSchema.parse({ seasonIds: [' a ', 'b'] })).toEqual({ seasonIds: ['a', 'b'] });
	});

	it('接受空数组', () => {
		expect(mergedSeasonOrderSchema.parse({ seasonIds: [] })).toEqual({ seasonIds: [] });
	});

	it('拒绝空字符串与纯空白', () => {
		expect(mergedSeasonOrderSchema.safeParse({ seasonIds: [''] }).success).toBe(false);
		expect(mergedSeasonOrderSchema.safeParse({ seasonIds: ['  '] }).success).toBe(false);
	});

	it('拒绝缺少字段与非法类型', () => {
		expect(mergedSeasonOrderSchema.safeParse({}).success).toBe(false);
		expect(mergedSeasonOrderSchema.safeParse({ seasonIds: 'a' }).success).toBe(false);
	});
});

describe('mergedImageOrderSchema', () => {
	it('接受绝对路径数组', () => {
		const images = ['E:////a////1.jpg', 'E:////b////2.jpg'];
		expect(mergedImageOrderSchema.parse({ images })).toEqual({ images });
	});

	it('接受空数组', () => {
		expect(mergedImageOrderSchema.parse({ images: [] })).toEqual({ images: [] });
	});

	it('拒绝空字符串与缺少字段', () => {
		expect(mergedImageOrderSchema.safeParse({ images: [''] }).success).toBe(false);
		expect(mergedImageOrderSchema.safeParse({}).success).toBe(false);
	});
});
