import { describe, expect, it } from 'vitest';
import {
	buildMergeOwnerIndex,
	excludeMergedMembers,
	getGroupMembers,
	getMergeRejection,
	getMergeStack,
	type MergeableSeries,
} from '../../web/src/utils/seriesMerge';

/** 用普通对象构造，领域对象在结构上满足 `MergeableSeries` */
function series(id: string, mergedIds: string[] = [], images: string[] = []): MergeableSeries {
	return { id, title: id, images, mergedIds };
}

describe('buildMergeOwnerIndex', () => {
	it('把成员映射到主系列', () => {
		const owners = buildMergeOwnerIndex([series('a', ['b', 'c']), series('b'), series('c')]);
		expect(owners.get('b')).toBe('a');
		expect(owners.get('c')).toBe('a');
	});

	it('同一成员被多个主系列声明时保留先出现的', () => {
		const owners = buildMergeOwnerIndex([series('a', ['c']), series('b', ['c']), series('c')]);
		expect(owners.get('c')).toBe('a');
	});

	it('忽略把自己声明为成员的数据', () => {
		const owners = buildMergeOwnerIndex([series('a', ['a'])]);
		expect(owners.size).toBe(0);
	});
});

describe('excludeMergedMembers', () => {
	it('只保留主系列与独立系列', () => {
		const list = [series('a', ['b']), series('b'), series('c')];
		expect(excludeMergedMembers(list).map((item) => item.id)).toEqual(['a', 'c']);
	});

	it('没有合并关系时原样返回', () => {
		const list = [series('a'), series('b')];
		expect(excludeMergedMembers(list).map((item) => item.id)).toEqual(['a', 'b']);
	});
});

describe('getGroupMembers', () => {
	const byId = new Map([
		['a', series('a', ['c', 'b'])],
		['b', series('b')],
		['c', series('c')],
	]);

	it('按主系列记录的成员顺序返回', () => {
		expect(getGroupMembers(byId.get('a')!, byId).map((item) => item.id)).toEqual(['c', 'b']);
	});

	it('跳过找不到的悬空引用', () => {
		const main = series('a', ['ghost', 'b']);
		expect(getGroupMembers(main, byId).map((item) => item.id)).toEqual(['b']);
	});

	it('跳过指向自己的成员', () => {
		const main = series('a', ['a', 'b']);
		expect(getGroupMembers(main, byId).map((item) => item.id)).toEqual(['b']);
	});
});

describe('getMergeStack', () => {
	it('最多返回三层首图，其余计入溢出数量', () => {
		const members = [series('b', [], ['b.png']), series('c', [], ['c.png']), series('d', [], ['d.png'])];
		const stack = getMergeStack([...members, series('e', [], ['e.png'])]);
		expect(stack.images).toEqual(['b.png', 'c.png', 'd.png']);
		expect(stack.overflow).toBe(1);
	});

	it('没有首图的成员用空串占位', () => {
		const stack = getMergeStack([series('b')]);
		expect(stack.images).toEqual(['']);
		expect(stack.overflow).toBe(0);
	});

	it('允许调用方覆盖层数上限', () => {
		const stack = getMergeStack([series('b', [], ['b.png']), series('c', [], ['c.png'])], 1);
		expect(stack.images).toEqual(['b.png']);
		expect(stack.overflow).toBe(1);
	});
});

describe('getMergeRejection', () => {
	const owners = new Map([['member', 'main']]);

	it('允许把独立系列合并到主系列', () => {
		expect(getMergeRejection('free', 'main', owners)).toBeNull();
	});

	it('拒绝合并到自身', () => {
		expect(getMergeRejection('a', 'a', owners)).toBe('不能合并到自身');
	});

	it('拒绝合并到已在自己组内的系列', () => {
		const group = new Map([['b', 'a']]);
		expect(getMergeRejection('a', 'b', group)).toBe('该系列已在合并组中');
	});

	it('拒绝以已合并的系列作为主系列', () => {
		expect(getMergeRejection('free', 'member', owners)).toBe('该系列已被合并，不能作为主系列');
	});

	it('拒绝拖动一个已被合并的系列', () => {
		expect(getMergeRejection('member', 'free', owners)).toBe('该系列已被合并，请先脱离');
	});
});
