<template>
	<div class="video-controller-container" @click.stop>
		<VideoTimeline />
		<el-space :size="20">
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="prev">
				<PlayNextIcon ref="prevIcon" direction="prev" />
			</el-icon>
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="playerStore.togglePlay()">
				<PlayToggleIcon :play="!playerStore.isPlaying" />
			</el-icon>
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="next">
				<PlayNextIcon ref="nextIcon" direction="next" />
			</el-icon>
			<VideoTime />
			<VideoVolume :size="ICON_SIZE" />
		</el-space>
		<el-space :size="20">
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="shot">
				<ScreenShotIcon ref="shotIcon" />
			</el-icon>
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="toggleFullScreen">
				<FullScreenToggleIcon :full-screen="playerStore.isFullScreen" />
			</el-icon>
		</el-space>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoTimeline from './VideoTimeline.vue';
import VideoTime from './VideoTime.vue';
import VideoVolume from './VideoVolume.vue';
import { useEventListener } from '@vueuse/core';

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

useEventListener(document, 'fullscreenchange', () => {
	playerStore.setIsFullScreen(document.fullscreenElement !== null);
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
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	justify-content: space-between;
	background-color: map.get(token.$theme, 'video-controller-dark');
	padding: 1rem;
	padding-top: calc(1rem + var(--progress-height));
	color: map.get(token.$theme, 'l-9');
	.icon {
		cursor: pointer;
		transition: transform 0.3s ease;
		&:hover {
			transform: scale(1.1);
		}
	}
}
</style>
