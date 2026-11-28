import { describe, expect, it } from 'vitest';
import { applyExplicitOrder } from '../shared/series-order';

interface Item {
	id: string;
}

const key = (item: Item) => item.id;
const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('applyExplicitOrder', () => {
	it('按显式顺序重排', () => {
		expect(applyExplicitOrder(pool, ['c', 'a', 'b'], key).map(key)).toEqual(['c', 'a', 'b']);
	});

	it('未覆盖的条目按默认顺序追加在末尾', () => {
		expect(applyExplicitOrder(pool, ['c'], key).map(key)).toEqual(['c', 'a', 'b']);
	});

	it('空显式顺序保持默认顺序', () => {
		expect(applyExplicitOrder(pool, [], key).map(key)).toEqual(['a', 'b', 'c']);
	});

	it('跳过不存在的键与重复键，不丢条目', () => {
		expect(applyExplicitOrder(pool, ['ghost', 'b', 'b', 'a'], key).map(key)).toEqual(['b', 'a', 'c']);
	});

	it('不修改入参', () => {
		const source = [...pool];
		const order = ['c', 'a', 'b'];
		applyExplicitOrder(source, order, key);
		expect(source).toEqual(pool);
		expect(order).toEqual(['c', 'a', 'b']);
	});

	it('空池子返回空数组', () => {
		expect(applyExplicitOrder([] as Item[], ['a'], key)).toEqual([]);
	});

	it('池子里的重复键只保留第一次出现', () => {
		expect(applyExplicitOrder([{ id: 'a' }, { id: 'a' }, { id: 'b' }], [], key).map(key)).toEqual(['a', 'b']);
	});
});
