import { describe, expect, it } from 'vitest';
import { seasonSortSchema, seasonTitleSchema } from '~server/src/schema/season-fields';

describe('季字段写入参数', () => {
	it('标题去首尾空白后原样保留', () => {
		const result = seasonTitleSchema.safeParse({ title: '  第一季  ' });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ title: '第一季' });
	});

	it('空标题与纯空白标题是合法输入', () => {
		expect(seasonTitleSchema.safeParse({ title: '' }).success).toBe(true);
		expect(seasonTitleSchema.safeParse({ title: '  ' }).data).toEqual({ title: '' });
	});

	it('标题缺失或非字符串被拒绝', () => {
		expect(seasonTitleSchema.safeParse({}).success).toBe(false);
		expect(seasonTitleSchema.safeParse({ title: null }).success).toBe(false);
	});

	it('排序必须是大于等于 1 的整数', () => {
		expect(seasonSortSchema.safeParse({ sort: 1 }).success).toBe(true);
		expect(seasonSortSchema.safeParse({ sort: 0 }).success).toBe(false);
		expect(seasonSortSchema.safeParse({ sort: -1 }).success).toBe(false);
		expect(seasonSortSchema.safeParse({ sort: 1.5 }).success).toBe(false);
		expect(seasonSortSchema.safeParse({ sort: '1' }).success).toBe(false);
	});
});
