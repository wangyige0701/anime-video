<template>
	<div class="time-axis">
		<div ref="viewport" class="viewport">
			<div ref="content" class="content" @pointerdown="onPointerDown">
				<!-- 年份表头与月份刻度共用同一套刻度宽度，保证年份与月份严格对齐 -->
				<div class="years">
					<div
						v-for="year in years"
						:key="year.year"
						class="year"
						:style="{ width: `${year.span * AXIS_TICK_WIDTH}px` }"
					>
						{{ year.year }}
					</div>
				</div>
				<div class="months">
					<span v-if="selectionStyle" class="selection" :style="selectionStyle"></span>
					<div
						v-for="item in props.axis"
						:key="item.key"
						class="month"
						:class="{ empty: item.count === 0, selected: isMonthSelected(item.key, activeRange) }"
						:title="`${item.key}：${item.count} 部`"
					>
						<span class="bar" :style="{ height: `${barHeight(item.count)}px` }"></span>
						<span class="label">{{ item.month }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { AXIS_TICK_WIDTH, groupAxisYears, isMonthSelected, rangeToPixels } from '@/utils/timeAxis';
import { useTimeAxisSelection } from './useTimeAxisSelection';

/**
 * 上线时间筛选轴。
 *
 * 横轴为连续月份刻度，点击选中单月、拖动选中一段区间；
 * 刻度柱高表示该月上映数量，空档月份保留刻度但不显示柱体。
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

const years = computed(() => groupAxisYears(props.axis));
/** 刻度柱最大高度，用于把数量映射为柱高 */
const maxCount = computed(() => props.axis.reduce((max, item) => Math.max(max, item.count), 0));
const viewport = useTemplateRef('viewport');

// 时间轴通常很长，挂载后默认滚到最右侧，直接呈现最近年份
onMounted(() => {
	if (viewport.value) {
		viewport.value.scrollLeft = viewport.value.scrollWidth;
	}
});

const { contentRef, dragging, previewRange, onPointerDown } = useTimeAxisSelection(
	() => props.axis,
	(range) => emit('update:modelValue', range),
);

// 拖动期间展示预览范围，静态展示已提交的范围
const activeRange = computed(() => (dragging.value ? previewRange.value : props.modelValue));

const selectionStyle = computed(() => {
	const pixels = rangeToPixels(props.axis, activeRange.value);
	if (!pixels) {
		return null;
	}
	return { transform: `translateX(${pixels.left}px)`, width: `${pixels.width}px` };
});

/** 数量映射为 4 - 22px 的柱高，0 部时不绘制柱体 */
function barHeight(count: number) {
	if (count <= 0 || maxCount.value <= 0) {
		return 0;
	}
	return Math.max(4, Math.round((count / maxCount.value) * 22));
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.time-axis {
	--tick-width: 34px;
	width: 100%;
	user-select: none;
}

.viewport {
	width: 100%;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: thin;
	scrollbar-color: map.get(token.$theme, 'l-4') transparent;
}

.content {
	position: relative;
	width: max-content;
	padding-bottom: 4px;
	cursor: pointer;
	// 横向滑动交给浏览器滚动，触屏单击仍可选中单月，鼠标拖动负责划选区间
	touch-action: pan-x;
}

.years {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	color: map.get(token.$theme, 'l-7');
	font-size: 0.75rem;
}

.year {
	flex: 0 0 auto;
	line-height: 1;
	padding-bottom: 6px;
	border-left: 1px solid map.get(token.$theme, 'l-3');
	padding-left: 4px;
}

.months {
	position: relative;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: flex-end;
	border-bottom: 1px solid map.get(token.$theme, 'l-3');
}

.selection {
	position: absolute;
	top: -4px;
	bottom: 0;
	left: 0;
	background-color: map.get(token.$theme, 'primary');
	opacity: 0.28;
	border-radius: 3px;
	pointer-events: none;
}

.month {
	flex: 0 0 var(--tick-width);
	width: var(--tick-width);
	height: 48px;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	align-items: center;
	gap: 4px;
	position: relative;
	border-left: 1px dashed transparent;
	&:hover {
		background-color: map.get(token.$theme, 'd-4');
	}
	&.selected .label {
		color: token.$text-color-primary;
	}
	&.empty .bar {
		background-color: map.get(token.$theme, 'l-2');
	}
}

.bar {
	width: 8px;
	min-height: 1px;
	background-color: map.get(token.$theme, 'l-5');
	border-radius: 2px 2px 0 0;
	transition: height 0.2s ease;
}

.label {
	font-size: 0.6875rem;
	line-height: 1;
	color: map.get(token.$theme, 'l-6');
}
</style>
