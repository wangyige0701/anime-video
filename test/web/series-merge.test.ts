import { describe, expect, it } from 'vitest';
import {
	buildMergeOwnerIndex,
	excludeMergedMembers,
	getGroupMembers,
	getMergeRejection,
	getMergeCovers,
	orderMergedImages,
	orderMergedSeasons,
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

describe('getMergeCovers', () => {
	/** 卡片封面与叠层必须跟着合并组的最终顺序走，而不是各系列自己的 `images[0]` */
	const main = { id: 'a', title: 'A', images: ['a1.png', 'a2.png'], mergedIds: ['b', 'c'] };
	const members = [
		{ id: 'b', title: 'B', images: ['b1.png', 'b2.png'] },
		{ id: 'c', title: 'C', images: ['c1.png'] },
	];

	it('没有显式顺序时封面取主系列首图，成员各取自己的首图', () => {
		const result = getMergeCovers(main, members);
		expect(result.cover).toBe('a1.png');
		expect(result.covers).toEqual({ b: 'b1.png', c: 'c1.png' });
	});

	it('成员图片排到最前时，封面与该成员的叠层首图一起换掉', () => {
		const result = getMergeCovers({ ...main, mergedImageOrder: ['b2.png', 'a1.png'] }, members);
		expect(result.cover).toBe('b2.png');
		expect(result.covers).toEqual({ b: 'b2.png', c: 'c1.png' });
	});

	it('显式顺序里的失效路径被跳过，未覆盖的图按默认顺序续在末尾', () => {
		const result = getMergeCovers({ ...main, mergedImageOrder: ['gone.png', 'c1.png'] }, members);
		expect(result.cover).toBe('c1.png');
		expect(result.covers).toEqual({ b: 'b1.png', c: 'c1.png' });
	});

	it('成员没有图片时该层为空串，封面仍取有图的系列', () => {
		const result = getMergeCovers(main, [{ id: 'd', title: 'D', images: [] }]);
		expect(result.covers.d).toBe('');
		expect(result.cover).toBe('a1.png');
	});

	it('没有合并时退化为自己的首图，完全没有图片时为空串', () => {
		expect(getMergeCovers(main, [])).toEqual({ cover: 'a1.png', covers: {} });
		expect(getMergeCovers({ id: 'x', title: 'X', images: [] }, [])).toEqual({ cover: '', covers: {} });
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

describe('orderMergedSeasons', () => {
	const mainSeasons = [{ id: 'm1' }, { id: 'm2' }];
	const memberSeasons = [{ id: 'x1' }, { id: 'y1' }];

	it('没有显式顺序时按「主系列在前、成员按合并顺序」', () => {
		expect(orderMergedSeasons(mainSeasons, memberSeasons).map((item) => item.id)).toEqual(['m1', 'm2', 'x1', 'y1']);
	});

	it('显式顺序覆盖默认顺序，可跨系列交错', () => {
		expect(orderMergedSeasons(mainSeasons, memberSeasons, ['x1', 'm2', 'y1', 'm1']).map((item) => item.id)).toEqual(
			['x1', 'm2', 'y1', 'm1'],
		);
	});

	it('显式顺序里失效的季 id 被跳过，未覆盖的季追加在末尾', () => {
		expect(orderMergedSeasons(mainSeasons, memberSeasons, ['gone', 'y1']).map((item) => item.id)).toEqual([
			'y1',
			'm1',
			'm2',
			'x1',
		]);
	});

	it('没有季时返回空数组', () => {
		expect(orderMergedSeasons([], [], ['m1'])).toEqual([]);
	});
});

describe('orderMergedImages', () => {
	const main = ['E:/a/1.jpg', 'E:/a/2.jpg'];
	const member = ['E:/b/2.jpg'];

	it('默认主系列在前、成员追加', () => {
		expect(orderMergedImages(main, member)).toEqual(['E:/a/1.jpg', 'E:/a/2.jpg', 'E:/b/2.jpg']);
	});

	it('可跨系列交错，并按路径去重', () => {
		expect(orderMergedImages(main, ['E:/a/1.jpg', 'E:/b/2.jpg'], ['E:/b/2.jpg', 'E:/a/1.jpg'])).toEqual([
			'E:/b/2.jpg',
			'E:/a/1.jpg',
			'E:/a/2.jpg',
		]);
	});

	it('空输入返回空数组', () => {
		expect(orderMergedImages([], [], ['E:/a/1.jpg'])).toEqual([]);
	});
});
