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

/** 单个月份刻度的默认宽度，用于计算默认可见月份数量 */
export const AXIS_TICK_WIDTH = 34;

/**
 * 时间轴当前可见的月份窗口。
 *
 * 时间轴不再依赖原生横向滚动，而是只渲染窗口内的月份并拉伸填满可视区：
 * 窗口越小单月刻度越宽（放大），窗口越大刻度越窄（缩小总范围）。
 */
export interface AxisWindow {
	/** 窗口左端在完整轴中的下标 */
	start: number;
	/** 窗口包含的月份数量 */
	count: number;
}

/** 滚轮每一档的缩放系数，1.25 大约是「一次滚轮少显示四分之一」 */
export const AXIS_ZOOM_STEP = 1.25;

/** 放大后至少保留的月份数量，太小会导致单月刻度宽到失去参照 */
export const AXIS_MIN_VISIBLE_MONTHS = 6;

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
 * 把窗口收敛到完整轴范围内。
 *
 * `count` 为 0（尚未测量宽度）时回退为全量，保证首帧也能渲染出全部刻度；
 * 起点越界时贴住两侧，避免缩放后出现空白。
 */
export function clampAxisWindow(window: AxisWindow, total: number): AxisWindow {
	if (total <= 0) {
		return { start: 0, count: 0 };
	}
	const count = Math.min(Math.max(Math.round(window.count) || total, 1), total);
	const start = Math.min(Math.max(Math.round(window.start) || 0, 0), total - count);
	return { start, count };
}

/**
 * 计算初始可见窗口。
 *
 * 默认窗口宽度按「每格 34px」折算，并贴住最右侧，保持改造前「默认看最近月份」的习惯；
 * 已有选中范围时把范围居中，刷新后仍能在轴上直接看到当前筛选位置。
 */
export function initialAxisWindow(
	axis: AxisMonth[],
	width: number,
	range: SeriesDateRange | null,
	tickWidth = AXIS_TICK_WIDTH,
): AxisWindow {
	const total = axis.length;
	if (total <= 0 || width <= 0) {
		return { start: 0, count: 0 };
	}
	const fit = Math.max(1, Math.floor(width / tickWidth));
	const count = Math.min(Math.max(fit, Math.min(AXIS_MIN_VISIBLE_MONTHS, total)), total);
	const fallback: AxisWindow = { start: total - count, count };
	if (!range) {
		return fallback;
	}
	const startIndex = axis.findIndex((item) => item.key === range.from);
	const endIndex = axis.findIndex((item) => item.key === range.to);
	if (startIndex < 0 || endIndex < 0) {
		return fallback;
	}
	const center = (Math.min(startIndex, endIndex) + Math.max(startIndex, endIndex)) / 2;
	return clampAxisWindow({ start: Math.round(center - (count - 1) / 2), count }, total);
}

/**
 * 缩放可见窗口。
 *
 * `factor` 小于 1 表示放大（显示更少月份），大于 1 表示缩小；
 * `anchor` 是缩放锚点在完整轴上的位置（可为小数，通常是鼠标所在处），
 * 锚点前后的相对位置保持不变，因此滚轮缩放时指针下的月份不会跳动。
 */
export function zoomAxisWindow(window: AxisWindow, factor: number, anchor: number, total: number): AxisWindow {
	if (total <= 0 || !Number.isFinite(factor) || factor <= 0) {
		return clampAxisWindow(window, total);
	}
	const current = clampAxisWindow(window, total);
	const minCount = Math.min(AXIS_MIN_VISIBLE_MONTHS, total);
	const count = Math.min(Math.max(Math.round(current.count * factor), minCount), total);
	if (count === current.count) {
		return current;
	}
	const ratio = (anchor - current.start) / current.count;
	return clampAxisWindow({ start: Math.round(anchor - ratio * count), count }, total);
}

/** 平移可见窗口，`delta` 为正表示向右（更晚的月份）移动 */
export function panAxisWindow(window: AxisWindow, delta: number, total: number): AxisWindow {
	const current = clampAxisWindow(window, total);
	return clampAxisWindow({ start: current.start + delta, count: current.count }, total);
}

/**
 * 计算选中范围在当前窗口内的色块位置。
 *
 * 返回值是相对可视区宽度的百分比（0 - 100），这样缩放时无需重新换算像素；
 * 范围超出窗口时裁剪到窗口边缘，完全在窗口外时返回 `null`。
 */
export function rangeToBand(axis: AxisMonth[], window: AxisWindow, range: SeriesDateRange | null) {
	const view = clampAxisWindow(window, axis.length);
	if (!range || view.count <= 0) {
		return null;
	}
	const startIndex = axis.findIndex((item) => item.key === range.from);
	const endIndex = axis.findIndex((item) => item.key === range.to);
	if (startIndex < 0 || endIndex < 0) {
		return null;
	}
	const from = Math.max(Math.min(startIndex, endIndex), view.start);
	const to = Math.min(Math.max(startIndex, endIndex), view.start + view.count - 1);
	if (to < from) {
		return null;
	}
	return {
		left: ((from - view.start) / view.count) * 100,
		width: ((to - from + 1) / view.count) * 100,
	};
}

/** 选区块中心超过该百分比时，上方文案改为右对齐，避免文字溢出时间轴 */
export const BAND_TIP_RIGHT_THRESHOLD = 68;

/**
 * 计算选区块上方范围文案的水平定位。
 *
 * 文字朝容器内部延伸：默认与选区左端左对齐；选区落在右侧三分之一时
 * 改为与选区右端右对齐，这样收起态文案始终贴着选区块，又不会超出轴宽。
 */
export function bandTipStyle(band: { left: number; width: number }): { left?: string; right?: string } {
	const center = band.left + band.width / 2;
	if (center > BAND_TIP_RIGHT_THRESHOLD) {
		return { right: `${Math.max(0, 100 - band.left - band.width)}%` };
	}
	return { left: `${band.left}%` };
}

/** 把时间范围格式化为文案：单月只显示一个月份，未选择时使用兜底文案 */
export function formatAxisRange(range: SeriesDateRange | null, empty = '全部时间'): string {
	if (!range) {
		return empty;
	}
	return range.from === range.to ? range.from : `${range.from} ~ ${range.to}`;
}

/** 取窗口两端的月份组成「当前显示范围」文案 */
export function formatAxisWindow(axis: AxisMonth[], window: AxisWindow): string {
	const view = clampAxisWindow(window, axis.length);
	const slice = axis.slice(view.start, view.start + view.count);
	if (!slice.length) {
		return '';
	}
	const first = slice[0].key;
	const last = slice[slice.length - 1].key;
	return first === last ? first : `${first} ~ ${last}`;
}

/** 判断某个刻度是否在选中范围内，供高亮样式使用 */
export function isMonthSelected(key: string, range: SeriesDateRange | null) {
	if (!range) {
		return false;
	}
	return key >= range.from && key <= range.to;
}
