<template>
	<video ref="video" class="video-target" loop="false" autoplay="false" playsinline muted controls></video>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watchEffect } from 'vue';
import Hls from 'hls.js';
import { useVideoStore } from '@/stores/video';
import { getMasterM3u8Url } from '@config/route';

const HLS_SUPPORTED = Symbol('HLS_SUPPORTED');
const HLS_NATIVE_SUPPORTED = Symbol('HLS_NATIVE_SUPPORTED');

let hls: Hls | null = null;
let hlsSupported: symbol | null = null;
const video = useTemplateRef('video');
const videoPath = ref('');

const watchProgress = watchEffect(() => {
	const process = useVideoStore().changedProgress;
	video.value?.addEventListener?.(
		'loadedmetadata',
		() => {
			if (video.value) {
				video.value.currentTime = process;
			}
		},
		{ once: true },
	);
});

const watchVideoPath = watchEffect(() => {
	const path = videoPath.value;
	if (!path) {
		return;
	}
	const src = `http://localhost:3000${getMasterM3u8Url(path)}`;
	if (hlsSupported === HLS_SUPPORTED) {
		hls?.loadSource?.(src);
	} else if (hlsSupported === HLS_NATIVE_SUPPORTED) {
		video.value && (video.value.src = src);
	}
});

function play() {
	video.value?.play?.();
}

function pause() {
	video.value?.pause?.();
}

function setVideo(path: string, name: string, fullTime: number, seek: number = 0) {
	if (path && video.value) {
		video.value.style.opacity = '1';
		video.value.src = path;
		useVideoStore().setVideo(name, fullTime, seek);
	}
}

onMounted(() => {
	if (!video.value) {
		throw new Error('播放器不存在');
	}
	const el = video.value!;

	el.addEventListener('timeupdate', () => {
		useVideoStore().setCurrentTime(el.currentTime || 0);
	});

	if (Hls.isSupported()) {
		hlsSupported = HLS_SUPPORTED;

		hls = new Hls({
			maxBufferLength: 30, // 最多缓存 30 秒
			maxMaxBufferLength: 100, // 最大允许缓存
			maxBufferSize: 1024 * 1024 * 60, // 10MB 最大缓存大小
			lowLatencyMode: false,
			enableWebVTT: true,
		});

		hls.attachMedia(el);

		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			el.play();
		});

		hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function (event, data) {
			console.log(data.subtitleTracks);
		});
	} else if (el.canPlayType('application/vnd.apple.mpegurl')) {
		// Safari 原生支持 HLS
		hlsSupported = HLS_NATIVE_SUPPORTED;
		el.addEventListener('loadedmetadata', () => {
			el.play();
		});
	} else {
		throw new Error('浏览器不支持 HLS');
	}
});

onBeforeUnmount(() => {
	hls?.destroy?.();
	hlsSupported = null;
	watchProgress();
	watchVideoPath();
});

defineExpose({
	play,
	pause,
	get isPlay() {
		return !video.value?.paused;
	},
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
