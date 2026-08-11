<template>
	<video ref="video" class="video-target" playsinline preload="metadata"></video>
</template>

<script setup lang="ts">
import Hls from 'hls.js';
import { usePlayerStore } from '@/stores/player';
import { getMasterM3u8Url } from '~routes/server';
import { useEventListener } from '@vueuse/core';
import { createPromise } from '@wang-yige/utils';

let hls: Hls | null = null;
let isInitialized = false;
let isMetadataLoaded = false;
let isSyncingCurrentTime = false;
let pendingCurrentTime: number | undefined;
let sourceVersion = 0;
let playRequestVersion = 0;
const { promise: initialized, resolve: resolveInitialized, reject: rejectInitialized } = createPromise<void>();
const playerStore = usePlayerStore();
const video = useTemplateRef('video');

watch(
	() => playerStore.videoPath,
	async (path) => {
		const currentSourceVersion = ++sourceVersion;
		isMetadataLoaded = false;
		pendingCurrentTime = normalizeCurrentTime(playerStore.currentTime);

		if (video.value) {
			video.value.pause();
		}
		if (!path) {
			pendingCurrentTime = undefined;
			hls?.stopLoad();
			if (video.value) {
				video.value.removeAttribute('src');
				video.value.load();
			}
			playerStore.pause();
			return;
		}

		try {
			await initialized;
		} catch {
			playerStore.pause();
			return;
		}
		if (currentSourceVersion !== sourceVersion) {
			return;
		}

		const src = getMasterM3u8Url(path);
		if (!src) {
			playerStore.pause();
			return;
		}
		if (playerStore.isSupportedHls) {
			hls?.loadSource(src);
		} else if (playerStore.isSupportedNative && video.value) {
			video.value.src = src;
			video.value.load();
		}
	},
	{ immediate: true, flush: 'sync' },
);

watch(
	() => playerStore.currentTime,
	(currentTime) => {
		if (!isSyncingCurrentTime) {
			setCurrentTime(currentTime);
		}
	},
	{ flush: 'sync' },
);

watch(
	() => playerStore.isPlaying,
	() => {
		void playState();
	},
);

watch(
	() => playerStore.volume,
	(volume) => {
		applyVolume(volume);
	},
	{ immediate: true, flush: 'sync' },
);

useEventListener(window, 'keydown', (e) => {
	if (!isInitialized) {
		return;
	}
	if (e.code === 'Space' && !isEditingElement(e.target)) {
		e.preventDefault();
		e.stopPropagation();
		playerStore.togglePlay();
	}
});

function setCurrentTime(currentTime: number) {
	const time = normalizeCurrentTime(currentTime);
	if (!isMetadataLoaded || !video.value) {
		pendingCurrentTime = time;
		return;
	}
	video.value.currentTime = time;
}

/**
 * 元数据加载完成后的时间处理
 */
function applyPendingCurrentTime() {
	if (pendingCurrentTime === undefined || !video.value) {
		return;
	}
	const duration = video.value.duration;
	const maxTime = Number.isFinite(duration) ? duration : pendingCurrentTime;
	video.value.currentTime = Math.min(pendingCurrentTime, maxTime);
	pendingCurrentTime = undefined;
}

function normalizeCurrentTime(time: number) {
	return Number.isFinite(time) ? Math.max(time, 0) : 0;
}

function applyVolume(volume = playerStore.volume) {
	if (video.value) {
		const volumePercent = Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 100) : 100;
		video.value.volume = volumePercent / 100;
	}
}

function isEditingElement(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest('input, textarea, select, button, [contenteditable]'));
}

async function playState() {
	const requestVersion = ++playRequestVersion;
	if (!video.value || !playerStore.videoPath) {
		playerStore.pause();
		return;
	}
	try {
		await initialized;
	} catch {
		if (requestVersion === playRequestVersion) {
			playerStore.pause();
		}
		return;
	}
	await nextTick();
	if (requestVersion !== playRequestVersion || !video.value || !playerStore.videoPath) {
		return;
	}
	if (playerStore.isPlaying) {
		if (!isMetadataLoaded || !video.value.paused) {
			return;
		}
		try {
			await video.value.play();
		} catch {
			if (requestVersion === playRequestVersion) {
				playerStore.pause();
			}
			return;
		}
		if (requestVersion !== playRequestVersion && !playerStore.isPlaying) {
			video.value.pause();
		}
	} else {
		video.value.pause();
	}
}

onMounted(() => {
	if (!video.value) {
		rejectInitialized('播放器不存在');
		return;
	}
	const el = video.value;
	applyVolume();

	el.addEventListener('timeupdate', () => {
		if (el.currentTime !== playerStore.currentTime) {
			// 避免更新 watcher 的回调
			isSyncingCurrentTime = true;
			playerStore.setCurrentTime(el.currentTime || 0);
			isSyncingCurrentTime = false;
		}
	});
	el.addEventListener('loadedmetadata', () => {
		isMetadataLoaded = true;
		applyPendingCurrentTime();
		void playState();
	});
	el.addEventListener('error', () => {
		playerStore.pause();
	});
	el.addEventListener('ended', () => {
		playerStore.pause();
	});
	el.addEventListener('play', () => {
		playerStore.play();
	});
	el.addEventListener('pause', () => {
		playerStore.pause();
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

		hls.on(Hls.Events.ERROR, (_event, data) => {
			if (data.fatal) {
				playerStore.pause();
			}
		});
	} else if (!playerStore.isSupportedNative) {
		rejectInitialized('浏览器不支持 HLS');
		return;
	}

	isInitialized = true;
	resolveInitialized();
});

onBeforeUnmount(() => {
	playerStore.pause();
	hls?.destroy();
	playerStore.reset();
});

defineExpose({
	get isPlay() {
		return video.value ? !video.value.paused : false;
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
