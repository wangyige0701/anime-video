<template>
	<div class="detail-status">
		<el-popover
			ref="popover"
			placement="bottom-start"
			trigger="click"
			:show-arrow="false"
			effect="dark"
			popper-class="detail-metadata-popover"
			transition="popover-dropdown"
			:show-after="0"
			:hide-after="0"
		>
			<template #reference>
				<div v-if="!statusName" class="placeholder">选择状态</div>
				<div v-else class="status-container" :class="statusClass(currentStatus)">
					{{ statusName }}
				</div>
			</template>

			<div class="status">
				<div
					v-for="item in detailStatuses"
					:key="item.id"
					:class="statusClass(item.id)"
					class="status-item"
					:disabled="currentStatus === item.id"
					@click.stop="updateStatus(item.id)"
				>
					{{ item.name }}
				</div>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { seriesStatus } from '~config/seriesStatus';

const props = defineProps<{
	loading: boolean;
}>();
const emits = defineEmits<{
	(e: 'update:loading', id: boolean): void;
}>();

const popover = useTemplateRef('popover');
const detailStatuses = seriesStatus.filter((item) => item.id > 1);
const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const currentStatus = ref(series.value.status);
const statusName = computed(() => detailStatuses.find((item) => item.id === currentStatus.value)?.name);

watch(
	() => series.value.status,
	(newStatus) => {
		currentStatus.value = newStatus;
	},
);

function statusClass(id?: number) {
	return id ? `status-id-${id}` : '';
}

async function updateStatus(value: number) {
	if (currentStatus.value === value) {
		return;
	}
	popover.value?.hide();
	emits('update:loading', true);
	const oldStatus = currentStatus.value;
	try {
		currentStatus.value = value;
		await series.value.updateStatus(value);
	} catch (error) {
		currentStatus.value = oldStatus;
	}
	emits('update:loading', false);
}
</script>

<style scoped lang="scss">
@use 'sass:color';
@use './metadata.scss' as *;

$ongoing-color: #75d69c;
$completed-color: #b8c0cc;
$unaired-color: #f0bb72;

@mixin colors {
	--ongoing-color: #{$ongoing-color};
	--ongoing-color-hover: #{color.change($ongoing-color, $alpha: 0.15)};
	--ongoing-bg-color: #{color.change($ongoing-color, $alpha: 0.12)};
	--ongoing-border-color: #{color.change($ongoing-color, $alpha: 0.35)};
	--completed-color: #{$completed-color};
	--completed-color-hover: #{color.change($completed-color, $alpha: 0.15)};
	--completed-bg-color: #{color.change($completed-color, $alpha: 0.12)};
	--completed-border-color: #{color.change($completed-color, $alpha: 0.35)};
	--unaired-color: #{$unaired-color};
	--unaired-color-hover: #{color.change($unaired-color, $alpha: 0.15)};
	--unaired-bg-color: #{color.change($unaired-color, $alpha: 0.12)};
	--unaired-border-color: #{color.change($unaired-color, $alpha: 0.35)};
}

.detail-status {
	@include colors;
	@include metadata-item;
	@include metadata-content;
}

.placeholder {
	@include metadata-placeholder;
}

.status-container {
	cursor: pointer;
	display: inline-flex;
	padding: 6px 12px;
	border-radius: 5px;
	background-color: var(--bg-color);
	border: 1px solid var(--border-color);
	color: var(--color);
	font-size: 0.875rem;
	line-height: 1;
	white-space: nowrap;
	&.status-id-2 {
		--color: var(--ongoing-color);
		--bg-color: var(--ongoing-bg-color);
		--border-color: var(--ongoing-border-color);
	}
	&.status-id-3 {
		--color: var(--completed-color);
		--bg-color: var(--completed-bg-color);
		--border-color: var(--completed-border-color);
	}
	&.status-id-4 {
		--color: var(--unaired-color);
		--bg-color: var(--unaired-bg-color);
		--border-color: var(--unaired-border-color);
	}
}

.status {
	@include colors;
}

.status-item {
	cursor: pointer;
	padding: 10px 5px;
	display: flex;
	align-items: center;
	color: var(--color);
	line-height: 1;
	border-radius: 5px;
	transition:
		background-color 0.3s ease,
		opacity 0.3s ease;
	&.status-id-2 {
		--color: var(--ongoing-color);
		--hover-color: var(--ongoing-color-hover);
	}
	&.status-id-3 {
		--color: var(--completed-color);
		--hover-color: var(--completed-color-hover);
	}
	&.status-id-4 {
		--color: var(--unaired-color);
		--hover-color: var(--unaired-color-hover);
	}
	&.status-id-4 {
		--color: var(--unaired-color);
	}
	&::before {
		content: '';
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 10px;
		background-color: var(--color);
	}
	&:not([disabled='true']):hover {
		background-color: var(--hover-color);
	}
	&[disabled='true'] {
		cursor: not-allowed;
		&:hover {
			opacity: 0.6;
		}
	}
}
</style>
