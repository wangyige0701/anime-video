<template>
	<el-popover
		v-model:visible="visible"
		placement="top"
		trigger="click"
		:show-arrow="false"
		:show-after="0"
		:hide-after="0"
		popper-class="index-filter-date-popover"
	>
		<template #reference>
			<button type="button" class="trigger" :class="{ active: !!filter.dateRange }">
				<el-icon class="icon"><Calendar /></el-icon>
				<span class="label">{{ rangeLabel }}</span>
				<el-icon v-if="filter.dateRange" class="clear" @click.stop="filter.setDateRange(null)">
					<CircleClose />
				</el-icon>
			</button>
		</template>

		<div class="panel">
			<div class="panel-header">
				<span class="title">上线时间</span>
				<span class="tip">拖动划选时间段，单击选中单月</span>
				<el-button text size="small" :disabled="!filter.dateRange" @click="filter.setDateRange(null)">
					清除
				</el-button>
			</div>
			<IndexTimeAxis
				v-if="axis.length"
				:axis="axis"
				:model-value="filter.dateRange"
				@update:model-value="onSelect"
			/>
			<div v-else class="empty">暂无可筛选的上线时间</div>
		</div>
	</el-popover>
</template>

<script setup lang="ts">
import { Calendar, CircleClose } from '@element-plus/icons-vue';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { refreshEmitter } from '@/events/refresh';
import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { buildMonthAxis } from '@/utils/timeAxis';

/**
 * 上线时间过滤入口。
 *
 * 过滤栏高度固定，时间轴放不下，因此用浮层承载：
 * 浮层脱离文档流，打开与关闭都不会改变列表区域的高度和滚动位置。
 */
const filter = useIndexFilterStore();
const videoStore = useVideoStore();
const visible = ref(false);
const axis = ref<AxisMonth[]>([]);

/** 触发按钮上的范围摘要，未过滤时提示可点击 */
const rangeLabel = computed(() => {
	const range = filter.dateRange;
	if (!range) {
		return '选择时间范围';
	}
	return range.from === range.to ? range.from : `${range.from} ~ ${range.to}`;
});

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

/**
 * 提交划选结果并收起浮层。
 *
 * 收起后用户可以直接看到过滤后的列表；需要调整时再点开浮层即可。
 */
function onSelect(range: SeriesDateRange | null) {
	filter.setDateRange(range);
	visible.value = false;
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.trigger {
	cursor: pointer;
	display: inline-flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	font-size: 0.8125rem;
	line-height: 1.2;
	color: map.get(token.$theme, 'l-8');
	background-color: transparent;
	border: 1px solid map.get(token.$theme, 'd-3');
	border-radius: 5px;
	transition:
		color 0.2s ease,
		background-color 0.2s ease,
		border-color 0.2s ease;
	&:hover {
		color: map.get(token.$theme, 'l-9');
		background-color: map.get(token.$theme, 'd-3');
		border-color: map.get(token.$theme, 'l-2');
	}
	&.active {
		color: token.$text-color-primary;
		border-color: map.get(token.$theme, 'l-5');
		background-color: map.get(token.$theme, 'd-3');
	}
	.icon {
		font-size: 0.9rem;
	}
	.clear {
		font-size: 0.9rem;
		opacity: 0.7;
		&:hover {
			opacity: 1;
		}
	}
}

.panel {
	display: flex;
	flex-direction: column;
	gap: 8px;
	color: token.$text-color-regular;
}

.panel-header {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 10px;
	.title {
		font-size: 0.875rem;
		color: token.$text-color-primary;
	}
	.tip {
		flex: 1;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
	}
}

.empty {
	padding: 20px 0;
	text-align: center;
	font-size: 0.875rem;
	color: map.get(token.$theme, 'l-6');
}
</style>

<style lang="scss">
// 浮层由 Element Plus 挂载到 body，需要使用全局选择器覆盖默认亮色样式
@use 'sass:map';
@use '@/scss/token.scss' as token;

body .el-popover.el-popper.index-filter-date-popover {
	// 时间轴较长，固定一个便于观察的浮层宽度，窄屏时按视口收缩
	width: 720px;
	max-width: calc(100vw - 40px);
	padding: 12px;
	border-color: #{map.get(token.$theme, 'l-3')};
	background: map.get(token.$theme, 'd-5');
	box-shadow: 0 0 10px map.get(token.$theme, 'd-4');
}
</style>
