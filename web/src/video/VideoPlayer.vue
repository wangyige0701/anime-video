<template>
	<div class="video-player-container">
		<video ref="video" class="video-target" playsinline preload="metadata"></video>
		<div v-if="playerStore.isLoading" class="video-loading">
			<el-icon size="8rem">
				<PlayerLoading />
			</el-icon>
		</div>
	</div>
</template>

<script setup lang="ts">
import Hls, { type ErrorData } from 'hls.js';
import { useEventListener } from '@vueuse/core';
import { createPromise } from '@wang-yige/utils';
import { usePlayerStore } from '@/stores/player';
import { getMasterM3u8Url } from '~routes/server';
import { takeVideoShotToClipboard } from '@/utils/videoShot';

const emit = defineEmits<{
	(e: 'autoNext'): void;
}>();

let hls: Hls | null = null;
let isInitialized = false;
let isMetadataLoaded = false;
let isSyncingCurrentTime = false;
let pendingCurrentTime: number | undefined;
let sourceVersion = 0;
let playRequestVersion = 0;
let activeHlsSourceVersion = 0;
let activeHlsSourceUrl = '';
let bufferSyncFrame: number | null = null;
const END_THRESHOLD = 0.25;
let endHandled = false;
const { promise: initialized, resolve: resolveInitialized, reject: rejectInitialized } = createPromise<void>();
const playerStore = usePlayerStore();
const video = useTemplateRef('video');

watch(
	() => playerStore.videoPath,
	async (path) => {
		endHandled = false;
		const currentSourceVersion = ++sourceVersion;
		isMetadataLoaded = false;
		pendingCurrentTime = normalizeCurrentTime(playerStore.currentTime);
		playerStore.resetBuffer();
		playerStore.setLoading(Boolean(path));

		if (video.value) {
			video.value.pause();
		}
		if (!path) {
			pendingCurrentTime = undefined;
			activeHlsSourceVersion = 0;
			activeHlsSourceUrl = '';
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
			if (currentSourceVersion === sourceVersion) {
				playerStore.setLoading(false);
				playerStore.pause();
			}
			return;
		}
		if (currentSourceVersion !== sourceVersion) {
			return;
		}

		const src = getMasterM3u8Url(path);
		if (!src) {
			playerStore.setLoading(false);
			playerStore.pause();
			return;
		}
		activeHlsSourceVersion = currentSourceVersion;
		activeHlsSourceUrl = src;
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
			seek(currentTime);
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
	(volume) => applyVolume(volume),
	{ immediate: true, flush: 'sync' },
);

watch(
	() => playerStore.playbackRate,
	(rate) => {
		if (video.value) {
			video.value.playbackRate = rate;
		}
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

function seek(currentTime: number) {
	const time = normalizeCurrentTime(currentTime);
	if (!isMetadataLoaded || !video.value) {
		pendingCurrentTime = time;
		return;
	}
	video.value.currentTime = time;
}

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

function scheduleBufferedRangesSync() {
	if (bufferSyncFrame !== null) {
		return;
	}
	bufferSyncFrame = requestAnimationFrame(() => {
		bufferSyncFrame = null;
		const buffered = video.value?.buffered;
		playerStore.resetBuffer();
		if (!buffered) {
			return;
		}
		for (let index = 0; index < buffered.length; index++) {
			playerStore.setBuffer(buffered.start(index), buffered.end(index));
		}
	});
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
		} catch (error) {
			if (requestVersion === playRequestVersion) {
				playerStore.pause();
				ElMessage.error(getErrorMessage(error, '视频播放失败'));
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

function handleTimeUpdate() {
	const el = video.value;
	if (el && el.currentTime !== playerStore.currentTime) {
		isSyncingCurrentTime = true;
		playerStore.seek(el.currentTime || 0);
		isSyncingCurrentTime = false;
	}
}

function handleLoadedMetadata() {
	const el = video.value;
	if (!el) {
		return;
	}
	isMetadataLoaded = true;
	playerStore.setDuration(el.duration);
	applyPendingCurrentTime();
	scheduleBufferedRangesSync();
	void playState();
}

function handleLoadStart() {
	playerStore.setLoading(Boolean(playerStore.videoPath));
}

function handleError() {
	playerStore.setLoading(false);
	playerStore.pause();
	ElMessage.error(video.value?.error?.message || '视频播放错误');
}

function handleEnded() {
	const duration = video.value?.duration;
	playerStore.setLoading(false);
	if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
		playerStore.seek(duration);
	}
	playerStore.pause();
	autoNextVideo();
}

function isAtEnd() {
	const el = video.value;
	return Boolean(
		el && Number.isFinite(el.duration) && el.duration > 0 && el.currentTime >= el.duration - END_THRESHOLD,
	);
}

function finishPlayback() {
	if (endHandled) {
		return;
	}
	endHandled = true;
	handleEnded();
}

function handleSeeked() {
	scheduleBufferedRangesSync();
	if (isAtEnd()) {
		finishPlayback();
	} else {
		endHandled = false;
	}
}

useEventListener(video, 'timeupdate', handleTimeUpdate);
useEventListener(video, 'loadedmetadata', handleLoadedMetadata);
useEventListener(video, 'progress', scheduleBufferedRangesSync);
useEventListener(video, 'seeked', handleSeeked);
useEventListener(video, 'emptied', () => playerStore.resetBuffer());
useEventListener(video, 'loadstart', handleLoadStart);
useEventListener(video, 'waiting', () => playerStore.setLoading(true));
useEventListener(video, 'stalled', () => playerStore.setLoading(true));
useEventListener(video, 'loadeddata', () => playerStore.setLoading(false));
useEventListener(video, 'canplay', () => playerStore.setLoading(false));
useEventListener(video, 'error', handleError);
useEventListener(video, 'ended', finishPlayback);
useEventListener(video, 'play', () => playerStore.play());
useEventListener(video, 'playing', () => playerStore.setLoading(false));
useEventListener(video, 'pause', () => playerStore.pause());

function getErrorMessage(error: unknown, fallback: string) {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === 'string' && error) {
		return error;
	}
	return fallback;
}

function autoNextVideo() {
	if (!playerStore.isAutoPlay) {
		return;
	}
	emit('autoNext');
}

onMounted(() => {
	if (!video.value) {
		playerStore.setLoading(false);
		rejectInitialized('播放器不存在');
		return;
	}
	const el = video.value;
	applyVolume();

	if (playerStore.isSupportedHls) {
		hls = new Hls({
			maxBufferLength: 30, // 最多缓存 30 秒
			maxMaxBufferLength: 100, // 最大允许缓存
			maxBufferSize: 1024 * 1024 * 60, // 10MB 最大缓存大小
			lowLatencyMode: false,
			enableWebVTT: true,
		});

		hls.attachMedia(el);
		hls.on(Hls.Events.FRAG_BUFFERED, scheduleBufferedRangesSync);
		hls.on(Hls.Events.BUFFER_FLUSHED, scheduleBufferedRangesSync);
		hls.on(Hls.Events.ERROR, (_event, data) => {
			const sourceUrl = (data as ErrorData).url;
			if (
				data.fatal &&
				activeHlsSourceVersion === sourceVersion &&
				(!sourceUrl || sourceUrl === activeHlsSourceUrl)
			) {
				playerStore.setLoading(false);
				playerStore.pause();
				ElMessage.error(data.details || '视频播放错误');
			}
		});
	} else if (!playerStore.isSupportedNative) {
		playerStore.setLoading(false);
		rejectInitialized('浏览器不支持 HLS');
		return;
	}

	isInitialized = true;
	resolveInitialized();
});

onBeforeUnmount(() => {
	if (bufferSyncFrame !== null) {
		cancelAnimationFrame(bufferSyncFrame);
	}
	playerStore.setLoading(false);
	playerStore.pause();
	hls?.destroy();
	playerStore.reset();
});

defineExpose({
	get isPlay() {
		return video.value ? !video.value.paused : false;
	},
	shot() {
		return takeVideoShotToClipboard(video.value);
	},
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-player-container {
	width: 100%;
	height: 100%;
	position: relative;
}

.video-target {
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: center;
}

.video-loading {
	pointer-events: none;
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	color: map.get(token.$theme, 'l-9');
}
</style>
