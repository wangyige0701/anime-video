<template>
	<div class="detail">
		<div class="top">
			<DetailImage :images="series.value.images" />
			<div class="info">
				<div class="title">{{ series.value.title }}</div>
				<DetailMetadata />
				<DetailDescription :series="series.value" :disabled="status.waiting" />
			</div>
		</div>

		<el-collapse ref="listRef" v-loading="status.sorting" accordion class="list" v-model="activeSeasonId">
			<template v-for="season in seasons" :key="season.id">
				<DetailSeason
					:season="season"
					:active-episode-id="activeEpisodeId"
					:last-episode-id="lastEpisodeId"
					@play="play($event, season, series.value)"
				></DetailSeason>
			</template>
		</el-collapse>
	</div>

	<!-- 视频播放器 -->
	<VideoBox ref="videoBoxRef" @hide="activeEpisodeId = ''"></VideoBox>
</template>

<script setup lang="ts">
import type { Episode } from '@/data/episode';
import type { Season } from '@/data/season';
import { Series } from '@/data/series';
import { useVideoStore } from '@/stores/video';
import { WebRoute } from '~shared/web-route-config';
import router from '@/router';
import VideoBox from '@/components/detail/VideoBox.vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { usePlayerStore } from '@/stores/player';
import { useDraggable } from 'vue-draggable-plus';

definePage({
	name: 'Detail',
});

const route = useRoute(WebRoute.DETAIL);
const name = route.params.name;
route.meta.setTitle!(name);

let isUnmounted = false;
const playerStore = usePlayerStore();
const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting', 'sorting').onWaiting();
const videoBoxRef = useTemplateRef('videoBoxRef');
const series = shallowReactive<{ value: Series }>({ value: {} as Series });
const activeSeasonId = ref<string>('');
const activeEpisodeId = ref<string>('');
const lastEpisodeId = ref<string>('');

const listRef = useTemplateRef<ComponentPublicInstance>('listRef');
/**
 * 季列表的本地镜像：series.value.seasons 是 customRef，原地调整不会触发更新，
 * 且关系数组不允许原地修改，因此拖拽在镜像上完成，成功后再通过 setSeasons() 回写。
 *
 * 使用 shallowRef 而非 ref：ref 会把领域对象包成 Proxy 并丢失私有字段类型。
 */
const seasons = shallowRef<Season[]>([]);
/** 拖拽前的顺序快照，仅在提交失败时用于恢复 */
let seasonSnapshot: Season[] = [];

watch(
	() => series.value.seasons,
	(list) => {
		// 原地替换保持数组引用不变，避免拖拽实例持有过期数组
		seasons.value.splice(0, seasons.value.length, ...(list ?? []));
		triggerRef(seasons);
	},
	{ immediate: true },
);

// el-collapse 的模板 ref 是组件实例，拖拽需要挂到它的根元素上
useDraggable(
	computed(() => listRef.value?.$el as HTMLElement | undefined),
	seasons,
	{
		animation: 180,
		handle: '.season-handle',
		ghostClass: 'season-ghost',
		// 默认 clone 会 JSON 深拷贝被拖拽项，而 Season 实例含 Ref 等循环引用会直接抛错，
		// 拖拽只需要原对象引用，这里原样返回
		clone: (season) => season,
		onStart() {
			seasonSnapshot = [...seasons.value];
		},
		onEnd(event) {
			// 拖拽库原地调整数组，shallowRef 不会自动追踪，这里显式触发重渲染
			triggerRef(seasons);
			void commitSeasonSort(event.oldIndex, event.newIndex);
		},
	},
);

/**
 * 提交季排序。服务端会按“移动到第 N 位”把区间内其它季 ±1 平移，
 * 因此只提交被拖动的那一季，不能逐条提交。
 */
async function commitSeasonSort(oldIndex?: number, newIndex?: number) {
	if (status.sorting || oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
		return;
	}
	const moved = seasons.value[newIndex];
	if (!moved) {
		return;
	}
	status.onSorting();
	try {
		const success = await moved.updateSort(newIndex + 1);
		if (!success) {
			// updateSort 已回滚自身 sort，这里把本地顺序恢复成拖拽前的状态
			seasons.value.splice(0, seasons.value.length, ...seasonSnapshot);
			triggerRef(seasons);
			return;
		}
		// 其余季的 sort 已被服务端平移，本地同步镜像避免字段与显示顺序长期不一致
		seasons.value.forEach((season, index) => season.syncSort(index + 1));
		series.value.setSeasons([...seasons.value]);
	} finally {
		status.offSorting();
	}
}

provide(
	DETAIL_SERIES_DATA,
	computed(() => series.value),
);

function play(episode: Episode, season: Season, series: Series) {
	if (episode.id && videoBoxRef.value) {
		activeEpisodeId.value = episode.id;
		videoBoxRef.value.openAndPlay({
			seriesTitle: series.title || '',
			seriesId: series.id || '',
			seasonTitle: season.title || '',
			seasonId: season.id || '',
			episodeTitle: episode.title || '',
			episodeId: episode.id || '',
			videoPath: episode.path || '',
		});
	}
}

onMounted(async () => {
	try {
		const info = await useVideoStore().getSeriesDetail(seriesId);
		series.value = info;
		if (!isUnmounted) {
			playerStore.setSeriesId(series.value.id);
			const lastSeasonId = await playerStore.getLastSeasonId();
			if (lastSeasonId) {
				activeSeasonId.value = lastSeasonId;
			} else {
				activeSeasonId.value = series.value.seasons?.[0]?.id || '';
			}
			const lastEpisodeIdValue = await playerStore.getLastEpisodeId();
			if (lastEpisodeIdValue) {
				lastEpisodeId.value = lastEpisodeIdValue;
			}
		}
		status.offWaiting();
	} catch (error) {
		router.replace({ name: WebRoute.INDEX, replace: true });
		playerStore.reset();
	}
});

onBeforeUnmount(() => {
	isUnmounted = true;
	playerStore.reset();
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.detail {
	--padding: 50px;
	width: 100%;
	padding-left: var(--padding);
	padding-right: calc(token.$menu-width + token.$main-padding + var(--padding));
}

.top {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: 20px;
	margin-bottom: 30px;
	.info {
		display: flex;
		flex-direction: column;
		gap: 15px;
		flex: 1;
		color: token.$text-color-secondary;
		font-size: 1rem;
	}
	.title {
		color: token.$text-color-primary;
		font-size: 1.6rem;
	}
}

.list {
	border: 0;
	// 用 gap 代替 :not(:last-child) 的 margin，拖拽重排时不会因末尾元素变化产生位移抖动
	display: flex;
	flex-direction: column;
	gap: 20px;
}

// 拖动占位仅降低透明度，避免与季面板自身的样式叠加
.season-ghost {
	opacity: 0.5;
}
</style>
