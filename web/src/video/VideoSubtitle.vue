<template>
	<div class="video-subtitle">
		<el-popover
			placement="top"
			effect="dark"
			:fallback-placements="['top']"
			:offset="25"
			:show-arrow="false"
			:show-after="300"
			:popper-options="popperOptions"
			:append-to="props.popoverContainer || 'body'"
			:width="200"
			:disabled="props.disabled"
		>
			<template #reference>
				<span class="subtitle-title">
					{{ playerStore.subtitleTrackId < 0 || !subtitleTrack?.name ? '选择字幕' : subtitleTrack.name }}
				</span>
			</template>

			<div class="subtitle-track-list">
				<el-collapse :model-value="0" :before-collapse="() => false">
					<el-collapse-item :name="0" title="字幕源">
						<template #icon>
							<span></span>
						</template>
						<template v-for="track in playerStore.subtitleTracks" :key="track.id">
							<div class="subtitle-track-container">
								<button
									type="button"
									class="subtitle-track-item"
									:class="{ 'is-active': playerStore.subtitleTrackId === track.id }"
									:aria-current="playerStore.subtitleTrackId === track.id ? 'true' : undefined"
									@click.stop="playerStore.setSeasonSubtitleTrack(track.id)"
								>
									<span class="subtitle-track-indicator">
										<el-icon v-if="playerStore.subtitleTrackId === track.id" size="0.875rem">
											<EpisodePlayingIcon :is-playing="playerStore.isPlaying" />
										</el-icon>
									</span>
									<span class="subtitle-track-title">{{ track.name }}</span>
								</button>
							</div>
						</template>
					</el-collapse-item>
				</el-collapse>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';

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
const subtitleTrack = computed(() => playerStore.subtitleTracks[playerStore.subtitleTrackId]);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use './common.scss' as *;

.video-subtitle {
	line-height: 1;
}

.subtitle-title {
	@include video-controller-reference;
}

.subtitle-track-list {
	@include video-collapse;
}

.subtitle-track-container {
	display: flex;
	flex-direction: column;
	.subtitle-track-item {
		@include video-collapse-btn('subtitle-track');
	}
}
</style>
