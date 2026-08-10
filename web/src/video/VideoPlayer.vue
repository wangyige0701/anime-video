<template>
	<video ref="video" class="video-target" loop="false" autoplay="false" playsinline controls></video>
</template>

<script setup lang="ts">
import Hls from 'hls.js';
import { usePlayerStore } from '@/stores/player';
import { getMasterM3u8Url } from '~routes/server';
import { useEventListener } from '@vueuse/core';

let hls: Hls | null = null;
const playerStore = usePlayerStore();
const video = useTemplateRef('video');

watchEffect(() => {
	const currentTime = playerStore.currentTime;
	video.value?.addEventListener?.(
		'loadedmetadata',
		() => {
			if (video.value) {
				video.value.currentTime = currentTime;
			}
		},
		{ once: true },
	);
});

watchEffect(() => {
	const path = playerStore.videoPath;
	if (!path) {
		return;
	}
	const src = getMasterM3u8Url(path);
	if (playerStore.isSupportedHls) {
		hls?.loadSource(src);
	} else if (playerStore.isSupportedNative) {
		video.value && (video.value.src = src);
	}
});

watch(
	() => playerStore.isPlaying,
	() => {
		playState();
	},
);

useEventListener(window, 'keydown', (e) => {
	if (e.key === 'Space') {
		e.preventDefault();
		e.stopPropagation();
		playerStore.togglePlay();
		playState();
		return;
	}
});

async function playState() {
	if (!video.value) {
		return;
	}
	await nextTick();
	if (playerStore.isPlaying) {
		video.value.paused && video.value.play().catch(() => {});
	} else {
		!video.value.paused && video.value.pause();
	}
}

onMounted(() => {
	if (!video.value) {
		throw new Error('播放器不存在');
	}
	const el = video.value!;

	el.addEventListener('timeupdate', () => {
		if (el.currentTime !== playerStore.currentTime) {
			playerStore.setCurrentTime(el.currentTime || 0);
		}
	});

	if (playerStore.isSupportedHls) {
		hls = new Hls({
			maxBufferLength: 30, // 最多缓存 30 秒
			maxMaxBufferLength: 100, // 最大允许缓存
			maxBufferSize: 1024 * 1024 * 60, // 10MB 最大缓存大小
			lowLatencyMode: false,
			enableWebVTT: true,
		});

		hls.attachMedia(el);

		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			playState();
		});

		hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function (event, data) {
			console.log(data.subtitleTracks);
		});
	} else if (playerStore.isSupportedNative) {
		el.addEventListener('loadedmetadata', () => {
			playState();
		});
	} else {
		throw new Error('浏览器不支持 HLS');
	}

	el.addEventListener('play', () => {
		playerStore.play();
	});
	el.addEventListener('pause', () => {
		playerStore.pause();
	});
});

onBeforeUnmount(() => {
	hls?.destroy();
});

defineExpose({
	get isPlay() {
		return !video.value?.paused;
	},
});
</script>

<style scoped lang="scss">
.video-target {
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: center;
}
</style>
