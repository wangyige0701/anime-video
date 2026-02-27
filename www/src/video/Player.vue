<template>
	<video
		ref="video"
		class="video-target"
		loop="false"
		autoplay="false"
		playsinline
		muted
		controls
	></video>
</template>

<script setup lang="ts">
import { useVideoStore } from '@/stores/video';
import { useTemplateRef, watchEffect } from 'vue';

const video = useTemplateRef('video');

watchEffect(() => {
	const process = useVideoStore().changedProcess;
	if (video.value) {
		video.value.addEventListener(
			'loadedmetadata',
			() => {
				if (video.value) {
					video.value.currentTime = process;
				}
			},
			{ once: true },
		);
	}
});

function play() {
	video.value?.play?.();
}

function pause() {
	video.value?.pause?.();
}

function setVideo(
	path: string,
	name: string,
	fullTime: number,
	seek: number = 0,
) {
	if (path && video.value) {
		video.value.style.opacity = '1';
		video.value.src = path;
		useVideoStore().setVideo(name, fullTime, seek);

		video.value.addEventListener('timeupdate', () => {
			useVideoStore().setCurrentTime(video.value?.currentTime || 0);
		});
	}
}

defineExpose({
	play,
	pause,
	setVideo,
});
</script>

<style scoped lang="scss">
.video-target {
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: center;
	opacity: 0;
}
</style>
