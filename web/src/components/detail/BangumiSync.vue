<template>
	<div class="bangumi-sync">
		<el-tooltip content="从 Bangumi 同步季、集标题与排序" placement="bottom" :show-after="300">
			<el-button class="entry" :disabled="status.opening" @click="open">
				<template #icon>
					<el-icon><Connection /></el-icon>
				</template>
				同步 Bangumi
			</el-button>
		</el-tooltip>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { Connection } from '@element-plus/icons-vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { useVideoStore } from '@/stores/video';
import { buildCurrentSnapshot } from '@/utils/bangumiSync';
import { openDialog } from '@/utils/dialog';
import SyncDialog from './bangumi-sync/SyncDialog.vue';

/**
 * 详情页标题行右侧的同步入口。
 *
 * 这里只剩「打开对话框 + 处理结果」：对话框内容在 `bangumi-sync/SyncDialog.vue`，
 * 流程在 `bangumi-sync/useBangumiSync.ts`。入口把打开时的系列值压成快照传进去，
 * 对话框因此不需要详情页的 provide，也不会在页面切换后往已销毁的视图里写数据。
 */
const props = defineProps<{
	seriesId: string;
}>();
const emit = defineEmits<{
	(e: 'applied', series: Series): void;
}>();

const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
/** 对话框打开期间禁用入口：否则双击会叠出第二个对话框 */
const status = useVueStatusRef('opening');

async function open() {
	if (status.opening) {
		return;
	}
	status.onOpening();
	try {
		const total = await openDialog<number>({
			component: SyncDialog,
			title: '同步 Bangumi',
			dialogProps: { class: 'bangumi-dialog', width: '860px', top: '7vh', closeOnClickModal: false },
			componentProps: { seriesId: props.seriesId, snapshot: buildCurrentSnapshot(series.value) },
		});
		ElMessage.success(`已写入 Bangumi 数据 ${total} 项`);
		// 写入成功后重新扫描并装配该系列，页面上的标题与顺序才会与实际数据一致
		emit('applied', await useVideoStore().refreshSeries(props.seriesId));
	} catch {
		// 取消/关闭是正常路径；写入与刷新失败由 API 拦截器统一提示
	} finally {
		status.offOpening();
	}
}
</script>

<style scoped lang="scss">
.entry {
	flex-shrink: 0;
	// 颜色全部来自全局按钮封装，这里只管与标题行的尺寸配合
	height: 32px;
	padding: 0 12px;
	font-size: 0.8125rem;
}
</style>
