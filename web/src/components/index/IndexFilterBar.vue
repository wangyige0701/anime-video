<template>
	<div class="filter-bar">
		<!-- 标签文案说明该分段选择器筛选的是什么，避免只看到「标签/状态/时间」不知含义 -->
		<div class="group">
			<span class="group-label">筛选方式</span>
			<el-segmented
				class="switcher mode"
				size="small"
				:model-value="filter.mode"
				:options="modeOptions"
				@change="onModeChange"
			/>
		</div>

		<div class="content">
			<IndexFilterOptions
				v-if="filter.mode === 'types'"
				:options="typeOptions"
				:model-value="filter.types"
				@update:model-value="filter.setTypes"
			/>
			<IndexFilterOptions
				v-else-if="filter.mode === 'status'"
				:options="statusOptions"
				:model-value="filter.statuses"
				@update:model-value="filter.setStatuses"
			/>
			<IndexFilterDate v-else />
		</div>

		<div class="group">
			<span class="group-label">排序方式</span>
			<el-segmented
				class="switcher sort"
				size="small"
				:model-value="filter.sortMode"
				:options="sortOptions"
				@change="onSortChange"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SeriesFilterMode, SeriesSortMode } from '@/utils/seriesQuery';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { writableSeriesStatus } from '~shared/series-status';
import { seriesTypes } from '~shared/series-types';

/**
 * 首页底部过滤栏。
 *
 * 固定占据列表底部预留的高度，过滤组件在内容区展开（向上浮出），
 * 因此切换过滤方式、选中标签、展开时间轴都不会改变视频列表区域的高度与位置。
 */

const filter = useIndexFilterStore();

const modeOptions: Array<{ label: string; value: SeriesFilterMode }> = [
	{ label: '标签', value: 'types' },
	{ label: '状态', value: 'status' },
	{ label: '时间', value: 'date' },
];

const sortOptions: Array<{ label: string; value: SeriesSortMode }> = [
	{ label: '上线时间', value: 'date' },
	{ label: '名称', value: 'name' },
];

/** 标签过滤的可选项来自共享类型枚举 */
const typeOptions = seriesTypes;

/** 状态过滤排除「全部」这一非状态项 */
const statusOptions = writableSeriesStatus;

function onModeChange(value: string | number | boolean) {
	filter.setMode(value as SeriesFilterMode);
}

function onSortChange(value: string | number | boolean) {
	filter.setSortMode(value as SeriesSortMode);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.filter-bar {
	height: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 12px;
	padding: 6px 12px;
	background-color: map.get(token.$theme, 'sidebar-bg');
	border-radius: 10px;
	box-shadow: 0 0 0 1px map.get(token.$theme, 'd-3');
	// 过滤栏浮在列表之上，模糊底下的内容避免文字与卡片互相干扰
	backdrop-filter: blur(5px);
}

.group {
	flex: 0 0 auto;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.group-label {
	font-size: 0.6875rem;
	line-height: 1;
	padding-left: 2px;
	color: map.get(token.$theme, 'l-6');
}

.content {
	flex: 1;
	min-width: 0;
	height: 100%;
	display: flex;
	flex-direction: row;
	align-items: flex-end;
	// 与两侧分段控件底边对齐，避免标签行比分段按钮低一截
	padding-bottom: 4px;
}

.switcher {
	flex: 0 0 auto;
}
</style>
