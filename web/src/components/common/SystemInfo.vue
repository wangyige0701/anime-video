<template>
	<div v-if="systemInfo" class="system-info">
		<span class="system-info-label">
			<el-icon size="1.2rem">
				<ServerIcon />
			</el-icon>
			<span>服务端资源</span>
		</span>
		<div class="metric">
			<div class="metric-header">
				<span>CPU</span>
				<strong>{{ formatPercentage(systemInfo.cpu.usagePercentage) }}</strong>
			</div>
			<el-progress
				class="metric-progress cpu-progress"
				:percentage="cpuUsage"
				:show-text="false"
				:stroke-width="8"
				color="var(--el-color-primary)"
			/>
		</div>
		<div class="metric">
			<div class="metric-header">
				<span>内存</span>
				<strong>{{ formatMemory(systemInfo.memory.used, systemInfo.memory.total) }}</strong>
			</div>
			<el-progress
				class="metric-progress memory-progress"
				:percentage="memoryUsage"
				:show-text="false"
				:stroke-width="8"
				color="var(--el-color-primary-light-3)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useSystemStore } from '@/stores/system';

const { systemInfo } = storeToRefs(useSystemStore());
const cpuUsage = computed(() => normalizePercentage(systemInfo.value?.cpu.usagePercentage ?? 0));
const memoryUsage = computed(() => normalizePercentage(systemInfo.value?.memory.usagePercentage ?? 0));

function normalizePercentage(value: number) {
	return Math.min(Math.max(value, 0), 100);
}

function formatPercentage(value: number) {
	return `${Math.round(value)}%`;
}

function formatMemory(used: number, total: number) {
	return `${formatBytes(used)} / ${formatBytes(total)}`;
}

function formatBytes(bytes: number) {
	const gib = 1024 ** 3;
	return `${(bytes / gib).toFixed(1)} GB`;
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.system-info {
	display: flex;
	align-items: flex-end;
	gap: 22px;
	padding: 0 20px;
	color: map.get(token.$theme, 'l-8');
}

.system-info-label {
	display: inline-flex;
	align-items: flex-end;
	gap: 5px;
	font-size: 0.75rem;
	white-space: nowrap;
	color: map.get(token.$theme, 'l-7');
	line-height: 1;
}

.metric {
	width: 155px;
	display: grid;
	gap: 4px;
	font-size: 0.75rem;
}

.metric-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

strong {
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	color: map.get(token.$theme, 'l-9');
}

.metric-progress {
	:deep(.el-progress-bar__outer) {
		background-color: map.get(token.$theme, 'd-5');
	}

	:deep(.el-progress-bar__inner) {
		box-shadow: 0 0 8px map.get(token.$theme, 'l-5');
	}

	&.cpu-progress :deep(.el-progress-bar__inner) {
		background: linear-gradient(90deg, map.get(token.$theme, 'l-5'), map.get(token.$theme, 'l-8')) !important;
	}

	&.memory-progress :deep(.el-progress-bar__inner) {
		background: linear-gradient(90deg, map.get(token.$theme, 'l-3'), map.get(token.$theme, 'l-6')) !important;
	}
}

@media (max-width: 1240px) {
	.system-info {
		display: none;
	}
}
</style>
