<template>
	<div class="detail">
		<div class="top">
			<DetailImage :images="series.value.images" />
			<div class="info">
				<div class="title">{{ series.value.title }}</div>
				<div class="types">
					<span v-for="type in series.value.types" :key="type">
						{{ getSeriesTypeName(type) }}
					</span>
				</div>
				<div class="status">
					<span>{{ getSeriesStatusName(series.value.status) }}</span>
				</div>
				<DetailDescription :series="series.value" :disabled="status.waiting" />
			</div>
		</div>

		<el-collapse accordion class="list" v-model="activeSeasonId">
			<template v-for="season in series.value.seasons" :key="season.id">
				<DetailSeason
					:season="season"
					:active-episode-id="activeEpisodeId"
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
import { WebRoute } from '~routes/web';
import router from '@/router';
import { getSeriesTypeName } from '~config/seriesTypes';
import { getSeriesStatusName } from '~config/seriesStatus';
import VideoBox from '@/components/detail/VideoBox.vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { usePlayerStore } from '@/stores/player';

definePage({
	name: 'Detail',
});

let isUnmounted = false;
const playerStore = usePlayerStore();
const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting').onWaiting();
const videoBoxRef = useTemplateRef('videoBoxRef');
const series = shallowReactive<{ value: Series }>({ value: {} as Series });
const activeSeasonId = ref<string>('');
const activeEpisodeId = ref<string>('');
const lastEpisodeId = ref<string>('');

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
		gap: 10px;
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
	.season:not(:last-child) {
		margin-bottom: 20px;
	}
}
</style>
