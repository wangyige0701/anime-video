<template>
	<!-- 固定高度的宿主：展开的面板向上溢出，但指针仍在宿主子树内，不会触发 pointerleave 抖动 -->
	<div class="axis-wrap" @pointerenter="onPointerEnter" @pointerleave="onPointerLeave">
		<!-- 收起态：范围文案贴着选区块浮动在轴上方，不占布局宽度，时间轴才能铺满整行 -->
		<span v-if="!expanded && collapsedTip" class="band-tip" :style="collapsedTip.style">
			{{ collapsedTip.label }}
		</span>

		<div class="time-axis" :class="{ expanded, dragging, dense }" @wheel="onWheel">
			<div v-if="expanded" class="panel-head">
				<span class="head-range">{{ rangeLabel }}</span>
				<span class="head-side">
					<span class="head-window">{{ windowLabel }}</span>
					<button v-if="zoomed" type="button" class="head-reset" @click="showAllMonths">显示全部</button>
					<span v-else class="head-hint">滚轮缩放 · Shift 平移</span>
				</span>
			</div>

			<div ref="viewport" class="viewport">
				<div class="content" @pointerdown="onPointerDown">
					<!-- 年份表头与月份刻度共用 flex 权重，保证年份与月份严格对齐 -->
					<div v-show="expanded" class="years">
						<div
							v-for="year in years"
							:key="year.year"
							class="year"
							:class="{ tight: year.span * tickWidth < 32 }"
							:style="{ flexGrow: year.span }"
						>
							{{ year.year }}
						</div>
					</div>
					<div class="months">
						<!-- 选中范围色块：填充半透明、两侧描边不透明，收起与展开状态都能看清位置 -->
						<span v-if="bandStyle" class="band" :style="bandStyle"><i class="band-fill"></i></span>
						<div
							v-for="item in visibleMonths"
							:key="item.key"
							class="month"
							:class="{ empty: item.count === 0, selected: isMonthSelected(item.key, activeRange) }"
							:title="dragging ? undefined : `${item.key}：${item.count} 部`"
						>
							<span class="bar" :style="{ height: `${barHeight(item.count)}px` }"></span>
							<span class="label">{{ item.month }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth, AxisWindow } from '@/utils/timeAxis';
import {
	AXIS_TICK_WIDTH,
	AXIS_ZOOM_STEP,
	bandTipStyle,
	clampAxisWindow,
	formatAxisRange,
	formatAxisWindow,
	groupAxisYears,
	initialAxisWindow,
	isMonthSelected,
	panAxisWindow,
	rangeToBand,
	zoomAxisWindow,
} from '@/utils/timeAxis';
import { useTimeAxisSelection, type AxisDragLayout } from './useTimeAxisSelection';

/**
 * 上线时间筛选轴。
 *
 * 默认是过滤栏内的一条矮刻度条，鼠标悬浮时向上展开成完整面板；
 * 两种状态共用同一份「可见窗口」，因此展开、缩放、收起都不会丢失当前位置。
 *
 * 交互：
 * - 点击选中单月，拖动划选区间，拖到两侧外沿会自动平移窗口；
 * - 滚轮缩放可见月份数量（缩放锚点跟随鼠标），Shift + 滚轮平移窗口；
 * - 面板顶部与过滤栏都会显示当前选中的时间范围。
 */
const props = defineProps<{
	/** 连续月份刻度，由 buildMonthAxis 生成 */
	axis: AxisMonth[];
	/** 当前选中的时间范围，null 表示未过滤 */
	modelValue: SeriesDateRange | null;
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: SeriesDateRange | null): void;
}>();

const viewport = useTemplateRef('viewport');
/** 可视区宽度，用于把刻度数量换算成刻度宽度 */
const viewportWidth = ref(0);
/** 可见窗口，`count` 为 0 表示还没测量到宽度 */
const view = ref<AxisWindow>({ start: 0, count: 0 });

/** 指针是否停在时间轴上，用于判断展开后能否收起 */
const hovering = ref(false);
/** 是否展开为完整时间轴 */
const expanded = ref(false);

const total = computed(() => props.axis.length);
/** 收敛后的可见窗口，越界或数据变化后自动贴合有效范围 */
const currentView = computed<AxisWindow>(() => {
	if (total.value <= 0) {
		return { start: 0, count: 0 };
	}
	return view.value.count > 0 ? clampAxisWindow(view.value, total.value) : { start: 0, count: total.value };
});
const visibleMonths = computed(() =>
	props.axis.slice(currentView.value.start, currentView.value.start + currentView.value.count),
);
const years = computed(() => groupAxisYears(visibleMonths.value));
/** 单月刻度宽度，随缩放与可视区宽度变化 */
const tickWidth = computed(() => {
	const { count } = currentView.value;
	return viewportWidth.value > 0 && count > 0 ? viewportWidth.value / count : AXIS_TICK_WIDTH;
});
/** 刻度过密时隐藏月份文字，只保留柱体与年份 */
const dense = computed(() => tickWidth.value < 18);
/** 是否处于缩放状态（没有显示全部月份） */
const zoomed = computed(() => currentView.value.count < total.value);

/** 刻度柱最大高度，用于把数量映射为柱高；始终按全量统计，缩放时高度不变 */
const maxCount = computed(() => props.axis.reduce((max, item) => Math.max(max, item.count), 0));

const { dragging, previewRange, onPointerDown } = useTimeAxisSelection({
	getAxis: () => props.axis,
	getLayout,
	onAutoPan,
	onCommit: (range) => emit('update:modelValue', range),
});

// 拖动期间展示预览范围，静态展示已提交的范围
const activeRange = computed(() => (dragging.value ? previewRange.value : props.modelValue));

/** 面板与过滤栏共用的范围文案：拖动时实时更新，松手后显示已提交值 */
const rangeLabel = computed(() => formatAxisRange(activeRange.value, '拖动选择时间范围'));
const windowLabel = computed(() => formatAxisWindow(props.axis, currentView.value));

/** 当前选区块在当前窗口内的百分比位置，收起与展开状态共用 */
const band = computed(() => rangeToBand(props.axis, currentView.value, activeRange.value));

const bandStyle = computed(() => {
	const current = band.value;
	return current ? { left: `${current.left}%`, width: `${current.width}%` } : null;
});

/**
 * 收起态贴住选区块的范围文案。
 *
 * 文字浮在轴上方而不是挤在右侧，轴就能铺满整行；拖动时跟随预览范围移动，
 * 未选中时返回 null，由过滤栏右侧的「全部时间」兜底。
 */
const collapsedTip = computed(() => {
	const range = activeRange.value;
	const current = band.value;
	if (!range || !current) {
		return null;
	}
	return { label: formatAxisRange(range), style: bandTipStyle(current) };
});

/** 供拖拽划选换算下标：视口左边界 + 当前刻度宽度 + 窗口起点 */
function getLayout(): AxisDragLayout | null {
	const element = viewport.value;
	if (!element) {
		return null;
	}
	const rect = element.getBoundingClientRect();
	const { start, count } = currentView.value;
	if (rect.width <= 0 || count <= 0) {
		return null;
	}
	return { left: rect.left, tickWidth: rect.width / count, start, count };
}

/**
 * 边缘自动平移。
 *
 * 每帧移动窗口的 5%（至少一个月），拖动时指针停在边缘就能连续划选
 * 超出当前视野的区间；已经贴住数据两端时返回 false 让拖拽逻辑停止请求。
 */
function onAutoPan(direction: -1 | 1) {
	const { start, count } = currentView.value;
	const step = Math.max(1, Math.round(count * 0.05));
	const next = panAxisWindow({ start, count }, direction * step, total.value);
	if (next.start === start) {
		return false;
	}
	view.value = next;
	return true;
}

/** 滚轮缩放，Shift 或触控板横向滑动用于平移 */
function onWheel(event: WheelEvent) {
	const count = total.value;
	if (count <= 1) {
		return;
	}
	const rect = viewport.value?.getBoundingClientRect();
	if (!rect || rect.width <= 0) {
		return;
	}
	const current = currentView.value;
	if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
		// 一次滚轮平移窗口的十分之一，至少一个月
		const delta = event.deltaX || event.deltaY;
		const step = Math.sign(delta) * Math.max(1, Math.round(current.count * 0.1));
		view.value = panAxisWindow(current, step, count);
	} else {
		const tick = rect.width / current.count;
		const local = Math.min(Math.max((event.clientX - rect.left) / tick, 0), current.count);
		const factor = event.deltaY > 0 ? AXIS_ZOOM_STEP : 1 / AXIS_ZOOM_STEP;
		view.value = zoomAxisWindow(current, factor, current.start + local, count);
	}
	// 滚动缩放与平移都不应带动页面滚动
	event.preventDefault();
}

/** 一键回到全部月份，避免缩放后找不到更早的数据 */
function showAllMonths() {
	view.value = { start: 0, count: total.value };
}

/** 按可视区宽度与当前选中范围计算初始窗口 */
function resetView() {
	if (!props.axis.length || viewportWidth.value <= 0) {
		return;
	}
	view.value = initialAxisWindow(props.axis, viewportWidth.value, props.modelValue);
}

function syncWidth() {
	const width = viewport.value?.clientWidth ?? 0;
	if (width === viewportWidth.value) {
		return;
	}
	viewportWidth.value = width;
	if (view.value.count <= 0) {
		resetView();
	} else {
		view.value = clampAxisWindow(view.value, total.value);
	}
}

let observer: ResizeObserver | undefined;

onMounted(() => {
	syncWidth();
	// 过滤栏宽度随窗口变化，刻度密度需要跟着重算
	observer = new ResizeObserver(() => syncWidth());
	if (viewport.value) {
		observer.observe(viewport.value);
	}
});

onBeforeUnmount(() => {
	observer?.disconnect();
	observer = undefined;
});

// 全量数据刷新后轴会被重建，窗口按新数据与当前选中范围重新初始化
watch(
	() => props.axis,
	() => {
		if (total.value > 0) {
			resetView();
		} else {
			view.value = { start: 0, count: 0 };
		}
	},
);

function onPointerEnter() {
	hovering.value = true;
	expanded.value = true;
}

function onPointerLeave() {
	hovering.value = false;
	// 拖动中即使指针离开也不能收起，否则刻度高度变化会让范围预览错位
	if (!dragging.value) {
		expanded.value = false;
	}
}

// 在轴外松手后指针已经离开，此时补一次收起，避免面板一直挡住列表
watch(dragging, (value) => {
	if (!value && !hovering.value) {
		expanded.value = false;
	}
});

/** 数量映射为柱高：收起时 1 - 18px，展开时 2 - 40px；空档月份保留一根短刻度维持节奏 */
function barHeight(count: number) {
	const maxHeight = expanded.value ? 40 : 18;
	if (maxCount.value <= 0) {
		return 0;
	}
	if (count <= 0) {
		return expanded.value ? 3 : 2;
	}
	return Math.max(expanded.value ? 2 : 1, Math.round((count / maxCount.value) * maxHeight));
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.axis-wrap {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 26px;
}

// 收起态的范围文案：贴着选区块浮在轴上方，不占位、不挡指针
.band-tip {
	position: absolute;
	bottom: calc(100% + 2px);
	z-index: 1;
	font-size: 0.6875rem;
	line-height: 1;
	white-space: nowrap;
	color: rgba(#fff, 0.94);
	text-shadow: 0 1px 3px rgba(#000, 0.42);
	font-variant-numeric: tabular-nums;
	pointer-events: none;
}

.time-axis {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	height: 26px;
	overflow: hidden;
	user-select: none;
	border-radius: 6px;
	// 缩放、展开都会改变高度与底色，过渡让状态切换不突兀
	transition:
		height 0.18s ease,
		background-color 0.18s ease,
		box-shadow 0.18s ease,
		border-color 0.18s ease;
	// 展开态向上生长并浮在列表之上，宿主高度不变，指针不会因元素位移而被判定为离开
	&.expanded {
		height: 112px;
		padding: 6px 8px 4px;
		// 面板使用不透明深色底：底下是视频封面，透出内容会干扰刻度与选区的判读
		background-color: map.get(token.$theme, 'd-8');
		border: 1px solid map.get(token.$theme, 'd-5');
		border-radius: 10px;
		box-shadow:
			0 -10px 28px rgba(#000, 0.42),
			0 0 0 1px rgba(#000, 0.24);
	}
	&:not(.expanded):hover {
		background-color: rgba(#fff, 0.06);
	}
	&.dragging {
		cursor: ew-resize;
	}
}

.panel-head {
	flex: 0 0 auto;
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	gap: 10px;
	height: 16px;
	margin-bottom: 5px;
	font-size: 0.6875rem;
	line-height: 1;
	white-space: nowrap;
}

.head-range {
	flex: 0 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	color: map.get(token.$theme, 'l-9');
	font-variant-numeric: tabular-nums;
}

.head-side {
	flex: 0 0 auto;
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 8px;
	color: map.get(token.$theme, 'l-6');
}

.head-window {
	font-variant-numeric: tabular-nums;
}

.head-hint {
	color: map.get(token.$theme, 'l-5');
}

.head-reset {
	cursor: pointer;
	padding: 0 6px;
	height: 16px;
	font-size: 0.6875rem;
	line-height: 1;
	color: map.get(token.$theme, 'l-9');
	background-color: map.get(token.$theme, 'd-6');
	border: 1px solid map.get(token.$theme, 'd-4');
	border-radius: 4px;
	&:hover {
		background-color: map.get(token.$theme, 'primary');
		border-color: map.get(token.$theme, 'l-4');
	}
}

.viewport {
	flex: 1;
	min-height: 0;
	overflow: hidden;
}

.content {
	position: relative;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	cursor: ew-resize;
	// 横向拖动交给组件自己处理（划选/平移），纵向仍允许页面滚动
	touch-action: pan-y;
}

.years {
	flex: 0 0 auto;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	height: 14px;
	margin-bottom: 2px;
	color: map.get(token.$theme, 'l-6');
	font-size: 0.6875rem;
	line-height: 1;
}

.year {
	flex: 0 1 0;
	min-width: 0;
	padding: 1px 0 0 4px;
	overflow: hidden;
	white-space: nowrap;
	border-left: 1px solid map.get(token.$theme, 'd-5');
	// 极窄年份只保留分隔线，避免文字互相压叠
	&.tight {
		color: transparent;
	}
}

.months {
	position: relative;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: flex-end;
	border-bottom: 1px solid map.get(token.$theme, 'd-5');
	.time-axis:not(.expanded) & {
		// 收起态不画深色分隔线，只留一条极淡的白色基线，柱子像是立在轴上
		border-bottom: none;
		box-shadow: inset 0 -1px 0 rgba(#fff, 0.2);
	}
}

.band {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	// 描边使用不透明亮色，色块本身半透明，展开与收起状态都能定位范围
	border-left: 2px solid map.get(token.$theme, 'l-8');
	border-right: 2px solid map.get(token.$theme, 'l-8');
	border-radius: 3px;
	pointer-events: none;
	.time-axis:not(.expanded) & {
		// 收起态底衬是浅紫过滤栏，深色描边会变成黑框，改用白色描边标记选区两端
		border-color: rgba(#fff, 0.9);
	}
}

.band-fill {
	position: absolute;
	inset: 0;
	display: block;
	background-color: map.get(token.$theme, 'primary');
	opacity: 0.34;
	border-radius: 2px;
	// 收起态底色就是过滤栏本身，用白色薄蒙层提亮选中区间即可，不需要额外轨道
	.time-axis:not(.expanded) & {
		background-color: #fff;
		opacity: 0.24;
	}
}

.month {
	flex: 1 1 0;
	min-width: 0;
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	align-items: center;
	gap: 3px;
	position: relative;
	&:hover {
		background-color: map.get(token.$theme, 'd-7');
	}
	.time-axis:not(.expanded) &:hover {
		background-color: rgba(#fff, 0.09);
	}
	&.selected .bar {
		background-color: map.get(token.$theme, 'l-9');
	}
	&.empty .bar {
		background-color: map.get(token.$theme, 'l-2');
	}
	// 收起态底衬是浅紫过滤栏，用白色半透明柱体形成波形；空档月份只留极淡的短刻度
	.time-axis:not(.expanded) &.empty .bar {
		background-color: rgba(#fff, 0.24);
	}
}

.bar {
	width: 60%;
	max-width: 8px;
	min-height: 1px;
	background-color: map.get(token.$theme, 'l-5');
	border-radius: 2px 2px 0 0;
	transition:
		height 0.18s ease,
		background-color 0.18s ease;
	.time-axis:not(.expanded) & {
		max-width: 6px;
		background-color: rgba(#fff, 0.78);
		border-radius: 2px 2px 0 0;
	}
	.time-axis:not(.expanded) .month.selected & {
		background-color: #fff;
	}
}

.label {
	font-size: 0.625rem;
	line-height: 1;
	color: map.get(token.$theme, 'l-6');
	.time-axis.expanded & {
		padding-bottom: 2px;
	}
	.time-axis:not(.expanded) &,
	.time-axis.dense & {
		display: none;
	}
	.month.selected & {
		color: map.get(token.$theme, 'l-9');
	}
}
</style>
