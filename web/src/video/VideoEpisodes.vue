<template>
	<div>
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
										<span class="episode-title">{{ episode.title }}</span>
									</button>
								</template>
							</div>
						</el-collapse-item>
					</template>
				</el-collapse>
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
import EpisodePlayingIcon from '@/components/icons/EpisodePlayingIcon.vue';

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

watch(
	() => playerStore.seasonId,
	(seasonId) => {
		activeSeason.value = seasonId;
	},
	{ immediate: true, flush: 'sync' },
);

function switchEpisode(season: Season, episode: Episode) {
	if (playerStore.episodeId === episode.id) {
		return;
	}
	const seriesData = unref(series);
	playerStore.setVideo({
		seriesId: seriesData.id,
		seriesTitle: seriesData.title,
		seasonId: season.id,
		seasonTitle: season.title,
		episodeId: episode.id,
		episodeTitle: episode.title,
		videoPath: episode.path,
	});
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

@mixin ellipsis {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.episodes-title {
	cursor: pointer;
	font-size: 0.875rem;
	padding: 5px 10px;
	border-radius: 5px;
	transition: background-color 0.3s ease;
	&:hover {
		background-color: rgb(255 255 255 / 0.12);
	}
}

.episodes-list {
	.el-collapse {
		--el-collapse-border-color: transparent;
		--el-collapse-header-bg-color: transparent;
		--el-collapse-content-bg-color: transparent;
		--el-collapse-header-text-color: #{map.get(token.$theme, 'l-8')};
		--el-collapse-content-text-color: #{map.get(token.$theme, 'l-8')};
		--el-collapse-header-height: 2em;
		--el-collapse-header-font-size: 0.875rem;
		--el-collapse-content-font-size: 0.75rem;
		:deep(.el-icon) {
			font-size: inherit;
		}
		:deep(.el-collapse-item__content) {
			padding: 0;
			&:not(:last-child) {
				padding-bottom: 1em;
			}
		}
		:deep(.el-collapse-item__title) {
			@include ellipsis;
			padding-right: 10px;
		}
	}
}

.episodes-container {
	display: flex;
	flex-direction: column;
	.episode-item {
		cursor: pointer;
		width: 100%;
		min-width: 0;
		height: 2em;
		padding: 0 0.25em;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 5px;
		transition:
			color 0.2s ease,
			background-color 0.2s ease;
		&:hover,
		&:focus-visible {
			background-color: rgb(255 255 255 / 0.12);
			outline: none;
		}
		&.is-active {
			color: map.get(token.$theme, 'primary');
		}
	}
	.episode-indicator {
		width: 0.875rem;
		flex: 0 0 0.875rem;
		display: inline-flex;
		justify-content: center;
		align-items: center;
	}
	.episode-title {
		min-width: 0;
		flex: 1;
		@include ellipsis;
	}
}
</style>
