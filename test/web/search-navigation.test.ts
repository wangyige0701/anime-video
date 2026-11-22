import { describe, expect, it } from 'vitest';
import { planSearchNavigation } from '../../web/src/utils/search';

describe('planSearchNavigation', () => {
	it('从其它页面搜索时用 push 进入搜索页', () => {
		expect(planSearchNavigation('Index', '迷宫饭')).toEqual({
			kind: 'search',
			keyword: '迷宫饭',
			replace: false,
		});
	});

	it('已在搜索页继续输入时用 replace，避免堆积历史记录', () => {
		expect(planSearchNavigation('Search', '迷宫')).toEqual({
			kind: 'search',
			keyword: '迷宫',
			replace: true,
		});
	});

	it('关键词首尾空格会被裁剪', () => {
		expect(planSearchNavigation('Index', '  芙莉莲  ')).toEqual({
			kind: 'search',
			keyword: '芙莉莲',
			replace: false,
		});
	});

	it('搜索页清空关键词时退回首页并替换当前记录', () => {
		expect(planSearchNavigation('Search', '   ')).toEqual({ kind: 'index', replace: true });
	});

	it('非搜索页清空关键词时不做任何跳转', () => {
		expect(planSearchNavigation('Index', '')).toBeNull();
		expect(planSearchNavigation(undefined, '')).toBeNull();
	});

	it('当前路由名缺失时按普通页面处理', () => {
		expect(planSearchNavigation(undefined, '咒术')).toEqual({
			kind: 'search',
			keyword: '咒术',
			replace: false,
		});
	});
});
