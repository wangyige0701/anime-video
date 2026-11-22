/**
 * 上线时间筛选轴的纯计算逻辑。
 *
 * 时间轴需要「连续月份」而不是「有数据的月份」，否则跳过的月份会让刻度间距失真，
 * 因此这里统一把最早到最晚的月份补齐，缺失月份计数为 0。
 */

import type { SeriesDateRange, SeriesQueryItem } from './seriesQuery';
import { toMonthKey } from './seriesQuery';

/** 时间轴上的单个月份刻度 */
export interface AxisMonth {
	/** `YYYY-MM` 键 */
	key: string;
	year: number;
	/** 1 - 12 */
	month: number;
	/** 该月上映的系列数量，0 表示空档 */
	count: number;
}

/** 时间轴上归并同一年份后的一段刻度，用于渲染年份表头 */
export interface AxisYear {
	year: number;
	/** 该年份占用的刻度数量，用于设置表头宽度 */
	span: number;
}

/** 单个月份刻度的宽度，必须与组件样式中的刻度宽度保持一致 */
export const AXIS_TICK_WIDTH = 34;

/** 把 `YYYY-MM` 键转换为连续的月份序号，便于做区间补齐 */
export function toMonthIndex(key: string): number {
	const [year, month] = key.split('-').map(Number);
	return year * 12 + (month - 1);
}

/** 把连续的月份序号还原为 `YYYY-MM` 键 */
export function fromMonthIndex(index: number): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;
	return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 根据系列列表构建连续月份刻度。
 *
 * 没有条目或全部没有上线时间时返回空数组，由调用方展示空状态。
 */
export function buildMonthAxis(list: SeriesQueryItem[]): AxisMonth[] {
	const counts = new Map<string, number>();
	let minIndex = Number.POSITIVE_INFINITY;
	let maxIndex = Number.NEGATIVE_INFINITY;

	for (const item of list) {
		const key = toMonthKey(item.date);
		if (!key) {
			continue;
		}
		counts.set(key, (counts.get(key) ?? 0) + 1);
		const index = toMonthIndex(key);
		minIndex = Math.min(minIndex, index);
		maxIndex = Math.max(maxIndex, index);
	}

	if (!Number.isFinite(minIndex) || !Number.isFinite(maxIndex)) {
		return [];
	}

	const axis: AxisMonth[] = [];
	for (let index = minIndex; index <= maxIndex; index++) {
		const key = fromMonthIndex(index);
		axis.push({
			key,
			year: Math.floor(index / 12),
			month: (index % 12) + 1,
			count: counts.get(key) ?? 0,
		});
	}
	return axis;
}

/** 把连续月份刻度归并为年份表头 */
export function groupAxisYears(axis: AxisMonth[]): AxisYear[] {
	const years: AxisYear[] = [];
	for (const item of axis) {
		const last = years[years.length - 1];
		if (last && last.year === item.year) {
			last.span += 1;
		} else {
			years.push({ year: item.year, span: 1 });
		}
	}
	return years;
}

/**
 * 根据指针横坐标换算刻度下标。
 *
 * `contentLeft` 必须取**内容容器**（随滚动偏移）的左边界，而不是外层滚动容器的左边界，
 * 否则横向滚动后换算结果会整体偏移。
 */
export function resolveAxisIndex(
	clientX: number,
	contentLeft: number,
	count: number,
	tickWidth = AXIS_TICK_WIDTH,
): number {
	if (count <= 0) {
		return -1;
	}
	const index = Math.floor((clientX - contentLeft) / tickWidth);
	return Math.min(Math.max(index, 0), count - 1);
}

/**
 * 由起止下标生成时间范围。
 *
 * 拖动方向可能反向，这里统一交换，保证 `from <= to`；
 * 起止相同则视为选中单个月份。
 */
export function rangeFromIndexes(axis: AxisMonth[], startIndex: number, endIndex: number): SeriesDateRange | null {
	if (!axis.length) {
		return null;
	}
	const start = axis[Math.min(Math.max(startIndex, 0), axis.length - 1)];
	const end = axis[Math.min(Math.max(endIndex, 0), axis.length - 1)];
	if (!start || !end) {
		return null;
	}
	return startIndex <= endIndex ? { from: start.key, to: end.key } : { from: end.key, to: start.key };
}

/**
 * 计算范围在时间轴上的像素位置，用于渲染选中区块。
 *
 * 范围任一端落在轴外时返回 `null`，避免画出错位的色块。
 */
export function rangeToPixels(axis: AxisMonth[], range: SeriesDateRange | null) {
	if (!range || !axis.length) {
		return null;
	}
	const startIndex = axis.findIndex((item) => item.key === range.from);
	const endIndex = axis.findIndex((item) => item.key === range.to);
	if (startIndex < 0 || endIndex < 0) {
		return null;
	}
	const from = Math.min(startIndex, endIndex);
	const to = Math.max(startIndex, endIndex);
	return {
		left: from * AXIS_TICK_WIDTH,
		width: (to - from + 1) * AXIS_TICK_WIDTH,
	};
}

/** 判断某个刻度是否在选中范围内，供高亮样式使用 */
export function isMonthSelected(key: string, range: SeriesDateRange | null) {
	if (!range) {
		return false;
	}
	return key >= range.from && key <= range.to;
}
