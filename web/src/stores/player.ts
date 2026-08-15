import type { VideoInfoEpisode, VideoInfoSeason, VideoInfoSeries, VideoInfoStore, VideoPlayData } from '@/@types/video';
import Hls from 'hls.js';

const DEFAULT_VOLUME = 100;
const VOLUME_STORAGE_KEY = 'volume';
const VIDEO_INFO_STORAGE_KEY = 'videoInfo';
const VIDEO_INFO_RESERVED_KEYS = new Set(['seriesId', 'seasonId', 'episodeId', 'seasons', 'episodes', 't']);
const VIDEO_INFO_CACHE = { value: null } as { value: VideoInfoStore | null };

export const usePlayerStore = defineStore('player', () => {
	const isSupportedHls = Hls.isSupported();
	let video = document.createElement('video');
	const isSupportedNative = video.canPlayType('application/vnd.apple.mpegurl');
	video.remove();
	(video as unknown) = null;

	let seriesId = '';
	let seasonId = '';
	let episodeId = '';
	const isPlaying = ref(false);
	const seriesTitle = ref('');
	const seasonTitle = ref('');
	const episodeTitle = ref('');
	const videoPath = ref('');
	const currentTime = ref(0);
	const duration = ref(0);
	const buffer = ref<Array<[number, number]>>([]);
	const volume = ref(readStoredVolume());
	const isLoading = ref(true);
	const isControllerActive = ref(false);
	const isVolumeDragging = ref(false);
	const isFullScreen = ref(false);

	function setVideo(data: VideoPlayData) {
		seriesId = data.seriesId;
		seasonId = data.seasonId;
		episodeId = data.episodeId;
		seriesTitle.value = data.seriesTitle;
		seasonTitle.value = data.seasonTitle;
		episodeTitle.value = data.episodeTitle;
		videoPath.value = data.videoPath;
		currentTime.value = data.currentTime ?? 0;
		if (currentTime.value < 0) {
			currentTime.value = 0;
		}
	}

	function seek(time: number) {
		currentTime.value = time;
		if (seriesId && seasonId && episodeId) {
			setVideoInfoStored({ seriesId, seasonId, episodeId }, 'currentTime', time);
		}
	}

	function play() {
		isPlaying.value = true;
	}

	function pause() {
		isPlaying.value = false;
	}

	function togglePlay() {
		if (isPlaying.value) {
			pause();
		} else {
			play();
		}
	}

	function setVolume(vol: number) {
		const volumePercent = normalizeVolumePercent(vol);
		volume.value = volumePercent;
		localStorage.setItem(VOLUME_STORAGE_KEY, volumePercent.toString());
	}

	function setDuration(dur: number) {
		duration.value = dur;
	}

	function setBuffer(start: number, end: number) {
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			return;
		}
		buffer.value.push([start, end]);
	}

	function resetBuffer() {
		buffer.value = [];
	}

	function setLoading(loading: boolean) {
		isLoading.value = loading;
	}

	let controllerActiveTimeout: number | null = null;
	function triggerControllerActive() {
		isControllerActive.value = true;
		triggerControllerInactive();
	}

	function triggerControllerInactive(immediate = false) {
		if (controllerActiveTimeout !== null) {
			clearTimeout(controllerActiveTimeout);
			controllerActiveTimeout = null;
		}
		if (immediate) {
			isControllerActive.value = false;
			return;
		}
		controllerActiveTimeout = setTimeout(() => {
			controllerActiveTimeout = null;
			isControllerActive.value = false;
		}, 2000);
	}

	function clearControllerActiveTimeout(active = true) {
		if (controllerActiveTimeout !== null) {
			clearTimeout(controllerActiveTimeout);
			controllerActiveTimeout = null;
		}
		isControllerActive.value = active;
	}

	function setIsVolumeDragging(dragging: boolean) {
		isVolumeDragging.value = dragging;
	}

	function reset() {
		isPlaying.value = false;
		seriesTitle.value = '';
		seasonTitle.value = '';
		episodeTitle.value = '';
		videoPath.value = '';
		currentTime.value = 0;
		duration.value = 0;
		isLoading.value = true;
		resetBuffer();
		clearControllerActiveTimeout(false);
	}

	function setIsFullScreen(fullScreen: boolean) {
		isFullScreen.value = fullScreen;
	}

	return {
		isPlaying,
		seriesTitle,
		seasonTitle,
		episodeTitle,
		videoPath,
		currentTime,
		/** 是否支持 HLS */
		isSupportedHls,
		/** Safari 原生支持 HLS */
		isSupportedNative,
		volume,
		duration,
		buffer,
		isLoading,
		/** 是否激活控制器 */
		isControllerActive,
		/** 是否正在拖动音量滑块 */
		isVolumeDragging,
		/** 是否全屏 */
		isFullScreen,
		/** 设置视频信息 */
		setVideo,
		/** 播放视频 */
		play,
		/** 暂停视频 */
		pause,
		/** 切换播放状态 */
		togglePlay,
		/** 设置当前播放时间 */
		seek,
		/** 重置播放信息 */
		reset,
		/** 设置音量 */
		setVolume,
		/** 设置视频时长 */
		setDuration,
		/** 设置缓冲区时间 */
		setBuffer,
		/** 重置缓冲区时间 */
		resetBuffer,
		/** 设置加载状态 */
		setLoading,
		/** 触发控制器激活 */
		triggerControllerActive,
		/** 触发控制器不激活 */
		triggerControllerInactive,
		/** 清除控制器激活定时器 */
		clearControllerActiveTimeout,
		/** 设置是否正在拖动音量滑块 */
		setIsVolumeDragging,
		/** 设置是否全屏 */
		setIsFullScreen,
	};
});

function normalizeVolumePercent(volume: number) {
	return Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 100) : DEFAULT_VOLUME;
}

function readStoredVolume() {
	try {
		const storedValue = localStorage.getItem(VOLUME_STORAGE_KEY);
		return storedValue === null ? DEFAULT_VOLUME : normalizeVolumePercent(Number(storedValue));
	} catch {
		return DEFAULT_VOLUME;
	}
}

function getVideoInfoStored() {
	if (VIDEO_INFO_CACHE.value) {
		return VIDEO_INFO_CACHE.value;
	}
	try {
		const stored = JSON.parse(localStorage.getItem(VIDEO_INFO_STORAGE_KEY) ?? '[]') as unknown;
		const videoInfoStored = Array.isArray(stored) ? (stored as VideoInfoStore) : [];
		VIDEO_INFO_CACHE.value = videoInfoStored;
		return videoInfoStored;
	} catch {
		VIDEO_INFO_CACHE.value = [];
		return [];
	}
}

function setVideoInfoStored(
	ids: { seriesId: string; seasonId?: string; episodeId?: string },
	key: string,
	value: unknown,
	isDelete: boolean = false,
) {
	if (!ids.seriesId || !key || VIDEO_INFO_RESERVED_KEYS.has(key) || (ids.episodeId && !ids.seasonId)) {
		return false;
	}

	const videoInfo = getVideoInfoStored();
	const now = Date.now();
	let series = videoInfo.find((item) => item.seriesId === ids.seriesId);
	if (!series) {
		if (isDelete) {
			return false;
		}
		series = { seriesId: ids.seriesId, t: now, seasons: [] };
		videoInfo.push(series);
	}

	const updatedNodes: Array<VideoInfoSeries | VideoInfoSeason | VideoInfoEpisode> = [series];
	let target: VideoInfoSeries | VideoInfoSeason | VideoInfoEpisode = series;
	if (ids.seasonId) {
		let season = series.seasons.find((item) => item.seasonId === ids.seasonId);
		if (!season) {
			if (isDelete) {
				return false;
			}
			season = { seasonId: ids.seasonId, t: now, episodes: [] };
			series.seasons.push(season);
		}
		updatedNodes.push(season);
		target = season;
	}

	if (ids.episodeId) {
		const season = target as VideoInfoSeason;
		let episode = season.episodes.find((item) => item.episodeId === ids.episodeId);
		if (!episode) {
			if (isDelete) {
				return false;
			}
			episode = { episodeId: ids.episodeId, t: now };
			season.episodes.push(episode);
		}
		updatedNodes.push(episode);
		target = episode;
	}

	if (isDelete) {
		if (!Object.hasOwn(target, key)) {
			return false;
		}
		delete target[key];
	} else {
		target[key] = value;
	}
	updatedNodes.forEach((node) => {
		node.t = now;
	});

	const debouncedSetter = setVideoInfoStored as typeof setVideoInfoStored & {
		persistTimer?: ReturnType<typeof setTimeout>;
	};
	if (debouncedSetter.persistTimer) {
		clearTimeout(debouncedSetter.persistTimer);
	}
	debouncedSetter.persistTimer = setTimeout(() => {
		try {
			localStorage.setItem(VIDEO_INFO_STORAGE_KEY, JSON.stringify(videoInfo));
		} catch {}
	}, 500);
	return true;
}
