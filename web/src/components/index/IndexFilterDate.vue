<template>
	<div class="date-filter">
		<!-- 时间轴内联在过滤栏里，悬浮向上展开，不占用列表高度 -->
		<div v-if="axis.length" class="axis-host">
			<IndexTimeAxis :axis="axis" :model-value="filter.dateRange" @update:model-value="onSelect" />
		</div>
		<span v-else class="empty">暂无可筛选的上线时间</span>

		<!-- 右侧操作位固定宽度：未筛选提示「全部时间」，筛选后换成文字按钮，轴宽始终不变 -->
		<div class="actions">
			<span v-if="!filter.dateRange" class="hint">全部时间</span>
			<button v-else type="button" class="clear" title="清除时间筛选" @click="filter.setDateRange(null)">
				清除
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { refreshEmitter } from '@/events/refresh';
import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { buildMonthAxis } from '@/utils/timeAxis';

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

// 固定宽度的操作位：内容在「全部时间」与「清除」之间切换时轴宽不变，刻度不会重新分格
.actions {
	flex: 0 0 auto;
	width: 52px;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: flex-end;
}

.hint {
	font-size: 0.6875rem;
	line-height: 1;
	white-space: nowrap;
	color: map.get(token.$theme, 'l-6');
}

.clear {
	cursor: pointer;
	height: 18px;
	padding: 0 7px;
	font-size: 0.6875rem;
	line-height: 1;
	white-space: nowrap;
	font-family: inherit;
	// 中性白描边 + 主题亮色文字，五套主题下都能读清，也不会抢过滤栏主色
	color: map.get(token.$theme, 'l-9');
	background-color: rgba(#fff, 0.12);
	border: 1px solid rgba(#fff, 0.24);
	border-radius: 4px;
	transition:
		background-color 0.15s ease,
		border-color 0.15s ease,
		color 0.15s ease;
	&:hover {
		color: #fff;
		background-color: rgba(#fff, 0.22);
		border-color: rgba(#fff, 0.42);
	}
	&:active {
		background-color: rgba(#000, 0.16);
	}
	&:focus-visible {
		outline: 1px solid map.get(token.$theme, 'l-9');
		outline-offset: 1px;
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
</style>
