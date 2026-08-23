<template>
	<div class="video-controller-container" @click.stop @dblclick.stop>
		<VideoTimeline ref="timelineRef" @dragging="isTimelineDragging = $event" />

		<div class="video-menus">
			<VideoControllerSpace
				ref="leftControllerSpace"
				:tooltip-container="tooltipContainer"
				:disabled="isTimelineDragging"
			>
				<el-button data-tooltip="上一个" text :disabled="!(episodesRef?.canPrev ?? false)" @click.stop="prev">
					<el-icon>
						<PlayNextIcon ref="prevIcon" direction="prev" />
					</el-icon>
				</el-button>
				<el-button
					:data-tooltip="!playerStore.isPlaying ? '播放' : '暂停'"
					text
					@click.stop="playerStore.togglePlay()"
				>
					<el-icon>
						<PlayToggleIcon :play="!playerStore.isPlaying" />
					</el-icon>
				</el-button>
				<el-button data-tooltip="下一个" text :disabled="!(episodesRef?.canNext ?? false)" @click.stop="next">
					<el-icon>
						<PlayNextIcon ref="nextIcon" direction="next" />
					</el-icon>
				</el-button>
				<el-button
					data-tooltip="回到开头"
					text
					:disabled="playerStore.currentTime < 1"
					@click.stop="backToStart"
				>
					<el-icon>
						<PlayStartIcon ref="startIcon" />
					</el-icon>
				</el-button>
				<VideoTime />
				<VideoVolume
					:data-tooltip="`音量（${playerStore.volume}）`"
					data-placement="top-start"
					:size="ICON_SIZE"
				/>
			</VideoControllerSpace>

			<VideoControllerSpace
				ref="rightControllerSpace"
				:tooltip-container="tooltipContainer"
				:disabled="isTimelineDragging"
			>
				<!-- 剧集选择 -->
				<VideoEpisodes ref="episodesRef" :popover-container="tooltipContainer" :disabled="isTimelineDragging" />
				<!-- 字幕选择 -->
				<VideoSubtitle
					v-if="playerStore.isSubtitleTrackUseable && playerStore.subtitleTracks.length"
					ref="subtitleRef"
					:popover-container="tooltipContainer"
					:disabled="isTimelineDragging"
				/>
				<!-- 自动播放开关 -->
				<el-switch
					:data-tooltip="playerStore.isAutoPlay ? '已开启自动连播' : '已关闭自动连播'"
					inactive-text="单播"
					active-text="连播"
					:active-value="true"
					:inactive-value="false"
					inline-prompt
					:model-value="playerStore.isAutoPlay"
					@update:model-value="playerStore.setIsAutoPlay($event as boolean)"
				></el-switch>
				<!-- 倍速选择 -->
				<el-button
					:data-tooltip="`倍速（${playerStore.playbackRate}x）`"
					text
					@click.stop="playbackRateClickHandler"
				>
					<el-icon>
						<PlaybackRateIcon ref="playbackRateIcon" :rate="playerStore.playbackRate" />
					</el-icon>
				</el-button>
				<!-- 截图 -->
				<el-button data-tooltip="截图" text @click.stop="shot">
					<el-icon>
						<ScreenShotIcon ref="shotIcon" />
					</el-icon>
				</el-button>
				<!-- 全屏 -->
				<el-button
					:data-tooltip="playerStore.isFullScreen ? '退出全屏' : '全屏'"
					text
					@click.stop="$emit('toggleFullscreen')"
				>
					<el-icon>
						<FullScreenToggleIcon :full-screen="playerStore.isFullScreen" />
					</el-icon>
				</el-button>
			</VideoControllerSpace>
		</div>

		<div ref="tooltipContainer" class="tooltip-container"></div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import { useEventListener } from '@vueuse/core';
import VideoTimeline from './VideoTimeline.vue';
import VideoTime from './VideoTime.vue';
import VideoVolume from './VideoVolume.vue';
import VideoControllerSpace from './VideoControllerSpace.vue';
import VideoEpisodes from './VideoEpisodes.vue';
import VideoSubtitle from './VideoSubtitle.vue';

const emit = defineEmits<{
	(e: 'toggleFullscreen'): void;
	(e: 'shot'): void;
}>();

const ICON_SIZE = '1.5rem';
const playerStore = usePlayerStore();
const timelineRef = useTemplateRef('timelineRef');
const prevIcon = useTemplateRef('prevIcon');
const nextIcon = useTemplateRef('nextIcon');
const shotIcon = useTemplateRef('shotIcon');
const tooltipContainer = useTemplateRef('tooltipContainer');
const leftControllerSpace = useTemplateRef('leftControllerSpace');
const rightControllerSpace = useTemplateRef('rightControllerSpace');
const startIcon = useTemplateRef('startIcon');
const playbackRateIcon = useTemplateRef('playbackRateIcon');
const episodesRef = useTemplateRef('episodesRef');
const isTimelineDragging = ref(false);

useEventListener(document, 'fullscreenchange', () => {
	playerStore.setIsFullScreen(document.fullscreenElement !== null);
	requestAnimationFrame(() => {
		leftControllerSpace.value?.updatePoppers();
		rightControllerSpace.value?.updatePoppers();
	});
});

function prev() {
	prevIcon.value?.trigger();
	void episodesRef.value?.prev();
}

function next() {
	nextIcon.value?.trigger();
	void episodesRef.value?.next();
}

function shot() {
	shotIcon.value?.trigger();
	emit('shot');
}

function backToStart() {
	startIcon.value?.trigger();
	timelineRef.value?.seek(0);
}

function playbackRateClickHandler() {
	playbackRateIcon.value?.trigger();
	playerStore.togglePlaybackRate();
}

defineExpose({
	autoNext() {
		if (!episodesRef.value?.canNext) {
			return;
		}
		episodesRef.value?.next();
	},
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-controller-container {
	--progress-height: 4px;
	width: 100%;
	padding-top: 1rem;
	color: map.get(token.$theme, 'l-9');
	background: linear-gradient(transparent, map.get(token.$theme, 'video-controller-dark'));
	:deep(.el-button) {
		&.is-disabled {
			opacity: 0.5;
			.el-icon {
				cursor: default;
				transform: none;
			}
		}
	}
	:deep(.el-icon) {
		cursor: pointer;
		font-size: v-bind('ICON_SIZE');
		transition: transform 0.3s ease;
		&:not(.no-hover):hover {
			transform: scale(1.1);
		}
	}
}

.video-menus {
	width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	justify-content: space-between;
	padding: 1rem;
}

.tooltip-container {
	width: 100%;
	height: 0;
	white-space: nowrap;
	isolation: isolate;
	z-index: 100;
}
</style>
