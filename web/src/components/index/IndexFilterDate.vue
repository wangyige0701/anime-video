<template>
	<div class="date-filter">
		<!-- 时间轴内联在过滤栏里，悬浮向上展开，不占用列表高度 -->
		<div v-if="axis.length" class="axis-host">
			<IndexTimeAxis :axis="axis" :model-value="filter.dateRange" @update:model-value="onSelect" />
		</div>
		<span v-else class="empty">暂无可筛选的上线时间</span>

		<!-- 未选中时提示「全部时间」；选中后范围文案浮在轴的选区块上方，这里只留等宽占位，避免轴宽跳动 -->
		<span class="range" :class="{ active: !!filter.dateRange }">{{ rangeText }}</span>

		<!-- 清除按钮始终占位，未筛选时只隐藏不参与交互，切换筛选状态时轴宽保持稳定 -->
		<el-button
			class="clear"
			:class="{ hidden: !filter.dateRange }"
			text
			size="small"
			title="清除时间筛选"
			@click="filter.setDateRange(null)"
		>
			<el-icon><CircleClose /></el-icon>
		</el-button>
	</div>
</template>

<script setup lang="ts">
import { CircleClose } from '@element-plus/icons-vue';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { refreshEmitter } from '@/events/refresh';
import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { buildMonthAxis, formatAxisRange } from '@/utils/timeAxis';

/**
 * 上线时间过滤入口。
 *
 * 刻度轴直接内联在过滤栏内容区：收起时只显示一条矮柱状概览，
 * 悬浮后向上展开成完整刻度轴（与浏览器控制台的时间轴一致），
 * 因此打开/收起都不会推挤视频列表，列表高度与滚动位置保持不变。
 *
 * 收起态也保留当前范围文案：时间轴只画位置，具体年月由文案说明。
 */
const filter = useIndexFilterStore();
const videoStore = useVideoStore();
const axis = ref<AxisMonth[]>([]);

const rangeText = computed(() => formatAxisRange(filter.dateRange, '全部时间'));

/**
 * 重建时间轴刻度。
 *
 * 刻度覆盖全部系列（不受其它过滤条件影响），否则选中某个标签后
 * 时间轴会缺少年份，用户无法在完整时间范围内切换。
 */
async function loadAxis() {
	try {
		axis.value = buildMonthAxis(await videoStore.all());
	} catch (error) {
		axis.value = [];
	}
}

onMounted(loadAxis);
// 全量刷新后系列的上线时间可能变化，刻度需要同步重建
refreshEmitter.on('series', loadAxis);
onBeforeUnmount(() => {
	refreshEmitter.off('series', loadAxis);
});

/** 选中的范围直接生效，列表立即按时间过滤 */
function onSelect(range: SeriesDateRange | null) {
	filter.setDateRange(range);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.date-filter {
	width: 100%;
	height: 26px;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 8px;
}

.axis-host {
	position: relative;
	flex: 1;
	min-width: 0;
	height: 26px;
}

.range {
	flex: 0 0 auto;
	// 固定宽度：选中前后占位一致，时间轴不会因文案长短重新分格
	width: 86px;
	text-align: right;
	font-size: 0.75rem;
	line-height: 1;
	white-space: nowrap;
	overflow: hidden;
	font-variant-numeric: tabular-nums;
	color: map.get(token.$theme, 'l-6');
	transition: opacity 0.15s ease;
	// 选中后范围文案已经在轴的选区块上方展示，这里只保留占位不重复显示
	&.active {
		opacity: 0;
	}
}

.empty {
	flex: 1;
	height: 26px;
	display: flex;
	align-items: center;
	padding-left: 4px;
	font-size: 0.75rem;
	color: map.get(token.$theme, 'l-6');
}

.clear {
	height: auto;
	padding: 2px;
	color: map.get(token.$theme, 'l-6');
	background-color: transparent;
	&:hover {
		color: map.get(token.$theme, 'l-9');
		background-color: transparent;
	}
	// 没有筛选时只隐藏，不改变布局，切换选中状态不会让时间轴重新分格
	&.hidden {
		visibility: hidden;
	}
}
</style>
