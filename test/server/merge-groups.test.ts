import { describe, expect, it } from 'vitest';
import { normalizeMergeGroups, type MergeGroups } from '~server/src/utils/merge-groups';

/**
 * 合并关系的规范化必须满足三条不变式：成员真实存在且不重复、一个成员只属于一个主系列、
 * 不出现链式合并。这里逐条覆盖，链式与成环是手工编辑数据文件才可能出现的极端输入。
 */

function normalize(groups: Record<string, string[]>) {
	return normalizeMergeGroups(new Map(Object.entries(groups)) as MergeGroups);
}

describe('normalizeMergeGroups', () => {
	it('保留合法的成员顺序', () => {
		const result = normalize({ a: ['b', 'c'], b: [], c: [] });
		expect(result.get('a')).toEqual(['b', 'c']);
		expect(result.get('b')).toEqual([]);
		expect(result.get('c')).toEqual([]);
	});

	it('移除自身、重复与不存在的成员', () => {
		const result = normalize({ a: ['a', 'b', 'b', 'ghost'], b: [] });
		expect(result.get('a')).toEqual(['b']);
	});

	it('同一成员被多个主系列声明时按先到先得归属', () => {
		const result = normalize({ a: ['c'], b: ['c'], c: [] });
		expect(result.get('a')).toEqual(['c']);
		expect(result.get('b')).toEqual([]);
	});

	it('链式合并会展平到最终主系列', () => {
		// b 既是 a 的成员，自己又持有 c
		const result = normalize({ a: ['b'], b: ['c'], c: [] });
		expect(result.get('a')).toEqual(['b', 'c']);
		expect(result.get('b')).toEqual([]);
		expect(result.get('c')).toEqual([]);
	});

	it('互相指向的环会消解为各自独立', () => {
		const result = normalize({ a: ['b'], b: ['a'] });
		expect(result.get('a')).toEqual([]);
		expect(result.get('b')).toEqual([]);
	});

	it('返回结果包含入参的每一个键', () => {
		const result = normalize({ a: [], b: [], c: [] });
		expect([...result.keys()].sort()).toEqual(['a', 'b', 'c']);
	});

	it('不修改入参', () => {
		const groups: MergeGroups = new Map([
			['a', ['b']],
			['b', ['c']],
			['c', []],
		]);
		normalizeMergeGroups(groups);
		expect(groups.get('a')).toEqual(['b']);
		expect(groups.get('b')).toEqual(['c']);
	});
});
