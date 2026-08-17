<template>
	<div class="system-info-in-video" v-if="systemInfo">
		<div class="info cpu">
			<span class="label">CPU</span>
			<el-icon class="no-hover icon">
				<PercentageGaugeIcon :percentage="cpuUsage" />
			</el-icon>
		</div>
		<div class="info memory">
			<span class="label">内存</span>
			<el-icon class="no-hover icon">
				<PercentageGaugeIcon :percentage="memoryUsage" />
			</el-icon>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useSystemStore } from '@/stores/system';
import { normalizePercentage } from '@/utils/format';

const { systemInfo } = storeToRefs(useSystemStore());

const cpuUsage = computed(() => normalizePercentage(systemInfo.value?.cpu.usagePercentage ?? 0));
const memoryUsage = computed(() => normalizePercentage(systemInfo.value?.memory.usagePercentage ?? 0));
</script>

<style scoped lang="scss">
.system-info-in-video {
	--icon-size: 2.8rem;
	--gap: 10px;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	font-size: 0.875rem;
	gap: 15px;
	.info {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 5px;
		position: relative;
		padding-right: calc(var(--icon-size) + var(--gap));
	}
	.label {
		line-height: 1;
		font-weight: bold;
	}
	.el-icon.icon {
		cursor: default;
		font-size: var(--icon-size);
		position: absolute;
		top: 50%;
		right: 0;
		transform: translateY(-50%);
	}
}
</style>
