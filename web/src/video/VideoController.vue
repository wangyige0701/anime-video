<template>
	<div class="video-controller-container" @click.stop>
		<VideoTimeline />

		<div class="video-menus">
			<VideoControllerSpace ref="leftControllerSpace" :tooltip-container="tooltipContainer">
				<el-icon data-tooltip="上一个" class="icon" :size="ICON_SIZE" @click.stop="prev">
					<PlayNextIcon ref="prevIcon" direction="prev" />
				</el-icon>
				<el-icon
					:data-tooltip="!playerStore.isPlaying ? '播放' : '暂停'"
					class="icon"
					:size="ICON_SIZE"
					@click.stop="playerStore.togglePlay()"
				>
					<PlayToggleIcon :play="!playerStore.isPlaying" />
				</el-icon>
				<el-icon data-tooltip="下一个" class="icon" :size="ICON_SIZE" @click.stop="next">
					<PlayNextIcon ref="nextIcon" direction="next" />
				</el-icon>
				<VideoTime />
				<VideoVolume
					:data-tooltip="`音量（${playerStore.volume}）`"
					data-placement="top-start"
					:size="ICON_SIZE"
				/>
			</VideoControllerSpace>

			<VideoControllerSpace ref="rightControllerSpace" :tooltip-container="tooltipContainer">
				<el-icon data-tooltip="截图" class="icon" :size="ICON_SIZE" @click.stop="shot">
					<ScreenShotIcon ref="shotIcon" />
				</el-icon>
				<el-icon
					:data-tooltip="playerStore.isFullScreen ? '退出全屏' : '全屏'"
					class="icon"
					:size="ICON_SIZE"
					@click.stop="toggleFullScreen"
				>
					<FullScreenToggleIcon :full-screen="playerStore.isFullScreen" />
				</el-icon>
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

const emit = defineEmits<{
	(e: 'prev'): void;
	(e: 'next'): void;
	(e: 'fullscreen'): void;
	(e: 'exitFullscreen'): void;
	(e: 'shot'): void;
}>();

const ICON_SIZE = '1.5rem';
const playerStore = usePlayerStore();
const prevIcon = useTemplateRef('prevIcon');
const nextIcon = useTemplateRef('nextIcon');
const shotIcon = useTemplateRef('shotIcon');
const tooltipContainer = useTemplateRef('tooltipContainer');
const leftControllerSpace = useTemplateRef('leftControllerSpace');
const rightControllerSpace = useTemplateRef('rightControllerSpace');

useEventListener(document, 'fullscreenchange', () => {
	playerStore.setIsFullScreen(document.fullscreenElement !== null);
	requestAnimationFrame(() => {
		leftControllerSpace.value?.updatePoppers();
		rightControllerSpace.value?.updatePoppers();
	});
});

function prev() {
	prevIcon.value?.trigger();
	emit('prev');
}

function next() {
	nextIcon.value?.trigger();
	emit('next');
}

function toggleFullScreen() {
	if (document.fullscreenElement) {
		emit('exitFullscreen');
	} else {
		emit('fullscreen');
	}
}

function shot() {
	shotIcon.value?.trigger();
	emit('shot');
}
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
	.icon {
		cursor: pointer;
		transition: transform 0.3s ease;
		&:hover {
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
