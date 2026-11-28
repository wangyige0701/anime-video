/**
 * 系列列表的本地筛选、排序与分组规则。
 *
 * 这里的函数都是纯函数：不依赖 Vue 响应式、领域对象方法和浏览器 API，
 * 既方便单元测试，也避免把查询规则散落到组件里。
 */

import { excludeMergedMembers, type MergeableSeries } from './seriesMerge';

/**
 * 参与筛选与排序的最小字段集合。
 *
 * `Series` 领域对象在结构上满足该接口，测试可直接传入普通对象。
 */
export interface SeriesQueryItem {
	id: string;
	title: string;
	description: string;
	types: number[];
	status: number;
	date: [year?: number, month?: number];
}

/** 列表排序方式：按上线时间（默认）或按名称 */
export type SeriesSortMode = 'date' | 'name';

/** 列表过滤方式，决定过滤栏展示哪一种过滤组件 */
export type SeriesFilterMode = 'types' | 'status' | 'date';

/**
 * 年月范围，使用 `YYYY-MM` 形式的键表示，两端都包含。
 *
 * 因为键本身定长且高位是年份，字符串比较等价于时间比较。
 */
export interface SeriesDateRange {
	from: string;
	to: string;
}

/** 当前生效的筛选与排序条件 */
export interface SeriesQuery {
	sortMode: SeriesSortMode;
	types: number[];
	statuses: number[];
	dateRange: SeriesDateRange | null;
}

/** 未设置上线时间的条目在分组时使用的空键 */
export const EMPTY_MONTH_KEY = '';

/** 未设置上线时间分组的展示文案 */
export const EMPTY_MONTH_LABEL = '未设置上线时间';

/**
 * 名称比较器。
 *
 * 与服务端初始化保持一致：按拼音排序、忽略大小写、数字按数值比较，
 * 保证「第 2 集」「第 10 集」这类标题顺序自然。
 */
const nameCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
	usage: 'sort',
	sensitivity: 'base',
	numeric: true,
});

/**
 * 创建一份默认查询条件。
 *
 * 默认按上线时间排序，且不设置任何过滤，避免多个调用方共享同一个可变对象。
 */
export function createDefaultSeriesQuery(): SeriesQuery {
	return {
		sortMode: 'date',
		types: [],
		statuses: [],
		dateRange: null,
	};
}

/**
 * 把系列日期转换为 `YYYY-MM` 键。
 *
 * 日期缺失或数值非法时返回 `null`，调用方据此区分「未设置上线时间」。
 */
export function toMonthKey(date?: [year?: number, month?: number]): string | null {
	const year = date?.[0];
	const month = date?.[1];
	if (!Number.isInteger(year) || !Number.isInteger(month)) {
		return null;
	}
	if (year! < 1 || month! < 1 || month! > 12) {
		return null;
	}
	return `${year}-${String(month).padStart(2, '0')}`;
}

/** 把 `YYYY-MM` 键转换为展示文案，空键表示未设置上线时间 */
export function formatMonthLabel(key: string): string {
	if (!key) {
		return EMPTY_MONTH_LABEL;
	}
	const matched = /^(\d{4})-(\d{2})$/.exec(key);
	if (!matched) {
		return key;
	}
	return `${matched[1]} 年 ${Number(matched[2])} 月`;
}

/**
 * 校正时间范围，保证 `from <= to`。
 *
 * 传入非法键或空范围时返回 `null`，让上层统一按「未过滤」处理。
 */
export function normalizeDateRange(range?: SeriesDateRange | null): SeriesDateRange | null {
	if (!range?.from || !range?.to) {
		return null;
	}
	const isMonthKey = (key: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
	if (!isMonthKey(range.from) || !isMonthKey(range.to)) {
		return null;
	}
	return range.from <= range.to ? { from: range.from, to: range.to } : { from: range.to, to: range.from };
}

/** 关键词是否命中标题或描述（大小写不敏感） */
export function matchesKeyword(item: SeriesQueryItem, keyword: string) {
	if (!keyword) {
		return true;
	}
	const target = keyword.toLocaleLowerCase();
	return item.title.toLocaleLowerCase().includes(target) || item.description.toLocaleLowerCase().includes(target);
}

/** 类型过滤：选中集合为空表示不过滤，否则要求至少命中一个类型 */
export function matchesTypes(item: SeriesQueryItem, types: number[]) {
	return types.length === 0 || item.types.some((type) => types.includes(type));
}

/** 状态过滤：选中集合为空表示不过滤 */
export function matchesStatuses(item: SeriesQueryItem, statuses: number[]) {
	return statuses.length === 0 || statuses.includes(item.status);
}

/**
 * 时间过滤：范围为 `null` 表示不过滤。
 *
 * 指定范围时，未设置上线时间的条目一律排除——它们无法判断是否落在范围内。
 */
export function matchesDateRange(item: SeriesQueryItem, range: SeriesDateRange | null) {
	if (!range) {
		return true;
	}
	const key = toMonthKey(item.date);
	if (!key) {
		return false;
	}
	return key >= range.from && key <= range.to;
}

/**
 * 按指定方式排序并返回新数组，不修改入参。
 *
 * - `name`：整体按名称排序。
 * - `date`：月份倒序；同月内按名称升序；未设置上线时间的条目排最后。
 */
export function sortSeriesList<T extends SeriesQueryItem>(list: T[], sortMode: SeriesSortMode): T[] {
	const result = [...list];
	if (sortMode === 'name') {
		result.sort(compareByName);
		return result;
	}
	result.sort((a, b) => {
		const left = toMonthKey(a.date);
		const right = toMonthKey(b.date);
		if (left === right) {
			return compareByName(a, b);
		}
		// 无上线时间的条目没有月份可比，统一沉到列表末尾
		if (!left) {
			return 1;
		}
		if (!right) {
			return -1;
		}
		return right.localeCompare(left);
	});
	return result;
}

/** 名称升序比较，供排序与分组复用 */
export function compareByName(a: SeriesQueryItem, b: SeriesQueryItem) {
	return nameCollator.compare(a.title, b.title);
}

/**
 * 按关键词与查询条件过滤、排序。
 *
 * 关键词先于其它条件执行：搜索与过滤是「与」关系，任一条件不满足即被排除。
 */
export function applySeriesQuery<T extends SeriesQueryItem>(
	list: T[],
	keyword = '',
	query?: Partial<SeriesQuery> | null,
): T[] {
	const { types = [], statuses = [], dateRange = null, sortMode = 'date' } = query ?? {};
	const range = normalizeDateRange(dateRange);
	const target = keyword.trim();
	const filtered = list.filter((item) => {
		return (
			matchesKeyword(item, target) &&
			matchesTypes(item, types) &&
			matchesStatuses(item, statuses) &&
			matchesDateRange(item, range)
		);
	});
	return sortSeriesList(filtered, sortMode);
}

/**
 * 本地分页。
 *
 * 页码非法时回退到第一页，避免筛选后页码残留导致的空页。
 */
export function paginateSeries<T>(list: T[], page: number, pageSize: number): T[] {
	const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
	const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : list.length;
	const start = (safePage - 1) * safeSize;
	return list.slice(start, start + safeSize);
}

/**
 * 重建首页已加载的数据。
 *
 * 全量数据有两个来源：首次分页请求，以及回到首页时的缓存快照。两者必须走同一套
 * 「剔除合并成员 → 过滤排序 → 截取到已加载页数」，否则刷新管线会把不符合条件的系列
 * 塞回列表，或者在合并之后把成员重新显示出来。
 *
 * @returns `items` 为前 `page * pageSize` 条，`total` 为当前条件下的总数
 */
export function buildIndexPage<T extends SeriesQueryItem & MergeableSeries>(
	all: T[],
	keyword: string,
	query: Partial<SeriesQuery> | null | undefined,
	page: number,
	pageSize: number,
) {
	const list = applySeriesQuery(excludeMergedMembers(all), keyword, query);
	const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
	const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : list.length;
	return { items: list.slice(0, safePage * safeSize), total: list.length };
}

/** 按年月分组的结果 */
export interface SeriesMonthGroup<T> {
	/** 分组键，未设置上线时间为空字符串 */
	key: string;
	/** 分组展示文案 */
	label: string;
	items: T[];
}

/**
 * 按年月分组。
 *
 * 分组保持入参顺序（调用方应传入已排序列表），所以同月条目的相对顺序即排序结果。
 */
export function groupSeriesByMonth<T extends SeriesQueryItem>(list: T[]): SeriesMonthGroup<T>[] {
	const groups = new Map<string, T[]>();
	for (const item of list) {
		const key = toMonthKey(item.date) ?? EMPTY_MONTH_KEY;
		const bucket = groups.get(key);
		if (bucket) {
			bucket.push(item);
		} else {
			groups.set(key, [item]);
		}
	}
	return [...groups.entries()].map(([key, items]) => ({ key, label: formatMonthLabel(key), items }));
}
