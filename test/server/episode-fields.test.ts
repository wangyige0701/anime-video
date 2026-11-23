import { describe, expect, it } from 'vitest';
import { episodeSortSchema, episodeTitleSchema } from '~server/src/schema/episode-fields';

describe('集字段写入参数', () => {
	it('标题去首尾空白后原样保留', () => {
		const result = episodeTitleSchema.safeParse({ title: '  第 1 集  ' });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ title: '第 1 集' });
	});

	it('空标题与纯空白标题是合法输入', () => {
		expect(episodeTitleSchema.safeParse({ title: '' }).success).toBe(true);
		expect(episodeTitleSchema.safeParse({ title: '\n  ' }).data).toEqual({ title: '' });
	});

	it('标题缺失或非字符串被拒绝', () => {
		expect(episodeTitleSchema.safeParse({}).success).toBe(false);
		expect(episodeTitleSchema.safeParse({ title: 1 }).success).toBe(false);
	});

	it('排序必须是大于等于 1 的整数', () => {
		expect(episodeSortSchema.safeParse({ sort: 2 }).success).toBe(true);
		expect(episodeSortSchema.safeParse({ sort: 0 }).success).toBe(false);
		expect(episodeSortSchema.safeParse({ sort: 2.5 }).success).toBe(false);
		expect(episodeSortSchema.safeParse({ sort: '2' }).success).toBe(false);
	});
});
