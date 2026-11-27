import { describe, expect, it } from 'vitest';
import { seriesMergeSchema } from '~server/src/schema/series-merge';

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
