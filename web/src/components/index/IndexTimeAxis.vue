<template>
	<!-- 固定高度的宿主：展开的面板向上溢出，但指针仍在宿主子树内，不会触发 pointerleave 抖动 -->
	<div
		class="axis-wrap"
		:title="props.modelValue ? `${props.modelValue.from} ~ ${props.modelValue.to}` : '拖动选择上线时间范围'"
		@pointerenter="onPointerEnter"
		@pointerleave="onPointerLeave"
	>
		<div class="time-axis" :class="{ expanded: expanded, dragging: dragging }">
			<div ref="viewport" class="viewport">
				<div ref="content" class="content" @pointerdown="onPointerDown">
					<!-- 年份表头与月份刻度共用同一套刻度宽度，保证年份与月份严格对齐 -->
					<div v-show="expanded" class="years">
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
 * 默认是过滤栏内的一条矮刻度条（类似浏览器控制台的性能概览），
 * 鼠标悬浮时向上展开显示年份表头与月份刻度；两种状态共用同一个滚动容器，
 * 因此展开前后选中的范围与滚动位置完全一致。
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

/** 指针是否停在时间轴上，用于判断展开后能否收起 */
const hovering = ref(false);
/** 是否展开为完整时间轴 */
const expanded = ref(false);

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

/** 数量映射为柱高：收起时 1 - 10px，展开时 2 - 22px，0 部时不绘制柱体 */
function barHeight(count: number) {
	const maxHeight = expanded.value ? 22 : 10;
	if (count <= 0 || maxCount.value <= 0) {
		return 0;
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
	height: 20px;
}

.time-axis {
	--tick-width: 34px;
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 20px;
	overflow: hidden;
	user-select: none;
	border-radius: 6px;
	transition:
		height 0.18s ease,
		background-color 0.18s ease,
		box-shadow 0.18s ease;
	// 展开态向上生长并浮在列表之上，宿主高度不变，指针不会因元素位移而被判定为离开
	&.expanded {
		height: 84px;
		padding: 6px 8px 2px;
		background-color: map.get(token.$theme, 'sidebar-bg');
		border: 1px solid map.get(token.$theme, 'd-3');
		border-radius: 10px;
		box-shadow: 0 -4px 16px map.get(token.$theme, 'd-4');
		backdrop-filter: blur(8px);
	}
	&:not(.expanded):hover {
		background-color: map.get(token.$theme, 'd-4');
	}
}

.viewport {
	width: 100%;
	height: 100%;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: thin;
	scrollbar-color: map.get(token.$theme, 'l-4') transparent;
	// 收起时不需要滚动条，展开后才允许拖动与滚轮横向滚动
	.time-axis:not(.expanded) & {
		scrollbar-width: none;
	}
	.time-axis.expanded & {
		padding-bottom: 4px;
	}
}

.content {
	position: relative;
	width: max-content;
	height: 100%;
	display: flex;
	flex-direction: column;
	cursor: pointer;
	// 横向滑动交给浏览器滚动，触屏单击仍可选中单月，鼠标拖动负责划选区间
	touch-action: pan-x;
}

.years {
	flex: 0 0 auto;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	height: 18px;
	color: map.get(token.$theme, 'l-7');
	font-size: 0.75rem;
}

.year {
	flex: 0 0 auto;
	line-height: 1;
	padding-bottom: 6px;
	border-left: 1px solid map.get(token.$theme, 'd-3');
	padding-left: 4px;
}

.months {
	position: relative;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: flex-end;
	border-bottom: 1px solid map.get(token.$theme, 'd-3');
	.time-axis:not(.expanded) & {
		border-bottom: none;
	}
}

.selection {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	background-color: map.get(token.$theme, 'primary');
	// 过滤栏本身是浅紫半透明，选区需要更高的不透明度才看得出来
	opacity: 0.42;
	border-radius: 3px;
	pointer-events: none;
}

.month {
	flex: 0 0 var(--tick-width);
	width: var(--tick-width);
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	align-items: center;
	gap: 4px;
	position: relative;
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
	transition: height 0.18s ease;
	.time-axis:not(.expanded) & {
		width: 5px;
		border-radius: 1px;
	}
}

.label {
	font-size: 0.6875rem;
	line-height: 1;
	color: map.get(token.$theme, 'l-6');
	.time-axis:not(.expanded) & {
		display: none;
	}
	.time-axis.expanded & {
		padding-bottom: 2px;
	}
}
</style>
