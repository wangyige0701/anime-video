<template>
	<div class="video-episodes">
		<el-popover
			placement="top"
			effect="dark"
			:fallback-placements="['top']"
			:offset="25"
			:show-arrow="false"
			:show-after="300"
			:popper-options="popperOptions"
			:append-to="props.popoverContainer || 'body'"
			:width="250"
			:disabled="props.disabled"
		>
			<template #reference>
				<span class="episodes-title">选集</span>
			</template>

			<div class="episodes-list">
				<el-scrollbar :max-height="playerStore.isFullScreen ? '60vh' : '40vh'">
					<el-collapse accordion v-model="activeSeason">
						<template v-for="season in unref(series).seasons" :key="season.id">
							<el-collapse-item :name="season.id" :title="season.title">
								<div class="episodes-container">
									<template v-for="episode in season.episodes" :key="episode.id">
										<button
											type="button"
											class="episode-item"
											:class="{ 'is-active': playerStore.episodeId === episode.id }"
											:aria-current="playerStore.episodeId === episode.id ? 'true' : undefined"
											@click.stop="switchEpisode(season, episode)"
										>
											<span class="episode-indicator">
												<el-icon v-if="playerStore.episodeId === episode.id" size="0.875rem">
													<EpisodePlayingIcon :is-playing="playerStore.isPlaying" />
												</el-icon>
											</span>
											<span class="episode-title" :title="episode.title">
												{{ episode.title }}
											</span>
										</button>
									</template>
								</div>
							</el-collapse-item>
						</template>
					</el-collapse>
				</el-scrollbar>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import type { Episode } from '@/data/episode';
import type { Season } from '@/data/season';
import { unref } from 'vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { usePlayerStore } from '@/stores/player';
import { KeyboardAction, useKeyboardAction } from '@/keyboard/action';

const props = withDefaults(
	defineProps<{
		popoverContainer?: HTMLElement | null;
		disabled?: boolean;
	}>(),
	{
		disabled: false,
	},
);

const popperOptions = { strategy: 'fixed' as const };
const playerStore = usePlayerStore();
const activeSeason = ref(playerStore.seasonId);
const series = inject<Ref<Series>>(DETAIL_SERIES_DATA)!;
const episodeEntries = computed(() =>
	unref(series).seasons.flatMap((season) => season.episodes.map((episode) => ({ season, episode }))),
);
const currentEpisodeIndex = computed(() =>
	episodeEntries.value.findIndex(
		({ season, episode }) => season.id === playerStore.seasonId && episode.id === playerStore.episodeId,
	),
);
const canPrev = computed(() => currentEpisodeIndex.value > 0);
const canNext = computed(
	() => currentEpisodeIndex.value >= 0 && currentEpisodeIndex.value < episodeEntries.value.length - 1,
);

watch(
	() => playerStore.seasonId,
	(seasonId) => {
		activeSeason.value = seasonId;
	},
	{ immediate: true, flush: 'sync' },
);

useKeyboardAction(KeyboardAction.Prev, prev);
useKeyboardAction(KeyboardAction.Next, next);

async function switchEpisode(season: Season, episode: Episode) {
	if (playerStore.seasonId === season.id && playerStore.episodeId === episode.id) {
		return;
	}
	const seriesData = unref(series);
	await playerStore.setVideo({
		seriesId: seriesData.id,
		seriesTitle: seriesData.title,
		seasonId: season.id,
		seasonTitle: season.title,
		episodeId: episode.id,
		episodeTitle: episode.title,
		videoPath: episode.path,
	});
	playerStore.play();
}

async function prev() {
	const index = currentEpisodeIndex.value;
	if (index <= 0) {
		return;
	}
	const target = episodeEntries.value[index - 1];
	if (target) {
		await switchEpisode(target.season, target.episode);
	}
}

async function next() {
	const index = currentEpisodeIndex.value;
	if (index < 0 || index >= episodeEntries.value.length - 1) {
		return;
	}
	const target = episodeEntries.value[index + 1];
	if (target) {
		await switchEpisode(target.season, target.episode);
	}
}

defineExpose({
	prev,
	next,
	get canPrev() {
		return canPrev.value;
	},
	get canNext() {
		return canNext.value;
	},
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use './common.scss' as *;

.video-episodes {
	line-height: 1;
}

.episodes-title {
	@include video-controller-reference;
}

.episodes-list {
	@include video-collapse;
	:deep(.el-scrollbar__wrap) {
		padding-left: 0;
	}
}

.episodes-container {
	display: flex;
	flex-direction: column;
	.episode-item {
		@include video-collapse-btn('episode');
	}
}
</style>
