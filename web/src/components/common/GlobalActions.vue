<template>
	<div class="global-actions" role="toolbar" aria-label="全局操作">
		<el-tooltip content="扫描并同步所有系列的视频数据" placement="bottom">
			<el-button class="global-action" type="primary" plain :loading="status.refresh" @click="handleRefresh">
				<template #icon>
					<el-icon><Refresh /></el-icon>
				</template>
				{{ status.refresh ? '正在同步' : '同步视频库' }}
			</el-button>
		</el-tooltip>
	</div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useVideoStore } from '@/stores/video';

const status = useVueStatusRef('refresh');

async function handleRefresh() {
	if (status.refresh) {
		return;
	}

	status.onRefresh();
	try {
		await useVideoStore().refresh();
		ElMessage.success('视频库已同步');
	} catch (error) {
		ElMessage.error(error instanceof Error ? error.message : '视频库同步失败，请稍后重试');
	} finally {
		status.offRefresh();
	}
}
</script>

<style scoped lang="scss">
.global-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 100%;
	padding-left: 20px;
}

.global-action {
	--el-button-text-color: var(--theme-light-9);
	--el-button-bg-color: var(--theme-dark-3);
	--el-button-border-color: var(--theme-light-5);
	--el-button-hover-text-color: var(--theme-light-9);
	--el-button-hover-bg-color: var(--theme-dark-2);
	--el-button-hover-border-color: var(--theme-light-7);
	--el-button-active-text-color: var(--theme-light-9);
	--el-button-active-bg-color: var(--theme-dark-4);
	--el-button-active-border-color: var(--theme-light-8);
	--el-mask-color-extra-light: rgba(0, 0, 0, 0.18);
	--el-color-primary-light-5: var(--theme-light-7);
	--el-color-primary-light-8: var(--theme-light-5);
	--el-color-primary-light-9: var(--theme-dark-3);
	min-width: 120px;
	border-radius: 10px;
	font-weight: 500;
}
</style>
