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

/**
 * 读取被合并系列的季与标题。
 *
 * 详情页把成员的季与主系列拼在一起展示，同步也覆盖同一范围，
 * 所以快照里必须带上它们，否则成员的季会被永远判成「有变化」。
 * 单个成员读取失败就跳过：悬空引用由数据层规范化清理，不该拦住整次同步。
 */
async function loadMembers(series: Series) {
	const ids = series.mergedIds ?? [];
	const members = await Promise.all(
		ids.map(async (id) => {
			try {
				return await useVideoStore().getSeriesDetail(id);
			} catch {
				return null;
			}
		}),
	);
	const list = members.filter((member): member is Series => !!member);
	return {
		titles: list.map((member) => member.title),
		seasons: list.flatMap((member) =>
			[...member.seasons].map((season) => ({
				id: season.id,
				episodes: [...season.episodes].map((episode) => ({
					id: episode.id,
					title: episode.title,
					kind: episode.kind,
				})),
			})),
		),
	};
}

async function open() {
	if (status.opening) {
		return;
	}
	status.onOpening();
	try {
		const members = await loadMembers(series.value);
		const total = await openDialog<number>({
			component: SyncDialog,
			title: '同步 Bangumi',
			dialogProps: { class: 'bangumi-dialog', width: '860px', top: '7vh', closeOnClickModal: false },
			componentProps: {
				seriesId: props.seriesId,
				snapshot: buildCurrentSnapshot(series.value, members.seasons),
				mergedTitles: members.titles,
			},
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
