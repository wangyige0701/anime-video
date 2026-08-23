import type { VideoPlayData } from '@/@types/video';
import {
	AUTO_PLAY_STORAGE_KEY,
	DEFAULT_VOLUME,
	PLAYBACK_RATES,
	VOLUME_STORAGE_KEY,
	SUBTITLE_TRACK_STORAGE_KEY,
	LAST_SEASON_ID_FIELD,
	LAST_EPISODE_ID_FIELD,
	LAST_SERIES_ID_STORAGE_KEY,
	DEFAULT_AUTO_PLAY,
	DEFAULT_SUBTITLE_TRACK,
} from '@/config/constants';
import { VideoInfoStorage } from '@/utils/videoInfoStorage';
import { isNumber, toBoolean } from '@wang-yige/utils';
import Hls from 'hls.js';

export const usePlayerStore = defineStore('player', () => {
	const isSupportedHls = Hls.isSupported();
	let video = document.createElement('video');
	const isSupportedNative = video.canPlayType('application/vnd.apple.mpegurl');
	video.remove();
	(video as unknown) = null;

	const seriesId = ref('');
	const seasonId = ref('');
	const episodeId = ref('');
	const isPlaying = ref(false);
	const seriesTitle = ref('');
	const seasonTitle = ref('');
	const episodeTitle = ref('');
	const videoPath = ref('');
	const currentTime = ref(0);
	const duration = ref(0);
	const buffer = ref<Array<[number, number]>>([]);
	const volume = ref(DEFAULT_VOLUME);
	const playbackRate = ref<(typeof PLAYBACK_RATES)[number]>(PLAYBACK_RATES[0]);
	const isLoading = ref(true);
	const isControllerActive = ref(false);
	const isVolumeDragging = ref(false);
	const isFullScreen = ref(false);
	const isAutoPlay = ref(DEFAULT_AUTO_PLAY);
	const isSubtitleTrack = ref(DEFAULT_SUBTITLE_TRACK);
	let videoRequestVersion = 0;

	async function initialize() {
		volume.value = normalizeVolumePercent(await VideoInfoStorage.get<number>(VOLUME_STORAGE_KEY, DEFAULT_VOLUME));
		isAutoPlay.value = await VideoInfoStorage.get<boolean>(AUTO_PLAY_STORAGE_KEY, DEFAULT_AUTO_PLAY);
		isSubtitleTrack.value = await VideoInfoStorage.get<boolean>(SUBTITLE_TRACK_STORAGE_KEY, DEFAULT_SUBTITLE_TRACK);
	}

	async function setVideo(data: VideoPlayData) {
		const requestVersion = ++videoRequestVersion;
		seriesId.value = data.seriesId;
		seasonId.value = data.seasonId;
		episodeId.value = data.episodeId;
		seriesTitle.value = data.seriesTitle;
		seasonTitle.value = data.seasonTitle;
		episodeTitle.value = data.episodeTitle;
		videoPath.value = data.videoPath;
		if (seriesId.value && seasonId.value && episodeId.value) {
			const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
			void storage.setSeries(LAST_SEASON_ID_FIELD, seasonId.value);
			void storage.setSeries(LAST_EPISODE_ID_FIELD, episodeId.value);
		}
		if (seriesId.value) {
			await VideoInfoStorage.set(LAST_SERIES_ID_STORAGE_KEY, seriesId.value, true);
		}
		pause();
		setDuration(0);
		if (isNumber(data.currentTime) && data.currentTime >= 0) {
			seek(data.currentTime);
		} else {
			const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
			const record = await storage.getEpisode<number>(VideoInfoStorage.CURRENT_TIME_FIELD);
			if (requestVersion !== videoRequestVersion) {
				return;
			}
			if (isValidPlaybackTime(record)) {
				seek(record);
			} else {
				seek(0);
				if (record !== undefined) {
					void storage.deleteEpisode(VideoInfoStorage.CURRENT_TIME_FIELD);
				}
			}
		}
	}

	function seek(time: number) {
		currentTime.value = time;
		if (seriesId.value && seasonId.value && episodeId.value) {
			const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
			if (duration.value > 0 && Number.isFinite(duration.value) && time >= duration.value) {
				void storage.deleteEpisode(VideoInfoStorage.CURRENT_TIME_FIELD);
			} else {
				void storage.setEpisode(VideoInfoStorage.CURRENT_TIME_FIELD, time);
			}
		}
	}

	function clearSeekStorage() {
		const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
		void storage.deleteEpisode(VideoInfoStorage.CURRENT_TIME_FIELD);
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
		VideoInfoStorage.set(VOLUME_STORAGE_KEY, volumePercent, true);
	}

	function togglePlaybackRate() {
		const currentIndex = PLAYBACK_RATES.indexOf(playbackRate.value);
		playbackRate.value = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] ?? PLAYBACK_RATES[0];
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

	function setIsAutoPlay(autoPlay: boolean) {
		isAutoPlay.value = autoPlay;
		VideoInfoStorage.set(AUTO_PLAY_STORAGE_KEY, autoPlay, true);
	}

	function setIsSubtitleTrack(enabled: boolean) {
		isSubtitleTrack.value = enabled;
		VideoInfoStorage.set(SUBTITLE_TRACK_STORAGE_KEY, enabled, true);
	}

	function setSeasonSubtitleTrack(track: number) {
		if (!seriesId.value || !seasonId.value) {
			return;
		}
		const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
		void storage.setSeason(SUBTITLE_TRACK_STORAGE_KEY, track);
	}

	async function getSeasonSubtitleTrack() {
		if (!seriesId.value || !seasonId.value) {
			return;
		}
		const storage = VideoInfoStorage.create(seriesId.value, seasonId.value, episodeId.value);
		return storage.getSeason<number>(SUBTITLE_TRACK_STORAGE_KEY);
	}

	function reset() {
		pause();
		seriesTitle.value = '';
		seasonTitle.value = '';
		episodeTitle.value = '';
		videoPath.value = '';
		seek(0);
		setDuration(0);
		setLoading(true);
		resetBuffer();
		clearControllerActiveTimeout(false);
	}

	function setIsFullScreen(fullScreen: boolean) {
		isFullScreen.value = fullScreen;
	}

	return {
		initialize,
		isPlaying,
		seriesTitle,
		seriesId,
		seasonTitle,
		seasonId,
		episodeTitle,
		episodeId,
		videoPath,
		currentTime,
		/** 是否支持 HLS */
		isSupportedHls,
		/** Safari 原生支持 HLS */
		isSupportedNative,
		volume,
		playbackRate,
		duration,
		buffer,
		isLoading,
		/** 是否激活控制器 */
		isControllerActive,
		/** 是否正在拖动音量滑块 */
		isVolumeDragging,
		/** 是否全屏 */
		isFullScreen,
		/** 是否自动播放 */
		isAutoPlay,
		/** 是否开启字幕轨道 */
		isSubtitleTrack,
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
		/** 清除当前播放时间存储 */
		clearSeekStorage,
		/** 重置播放信息 */
		reset,
		/** 设置音量 */
		setVolume,
		/** 切换播放速率 */
		togglePlaybackRate,
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
		/** 设置是否自动播放 */
		setIsAutoPlay,
		/** 设置是否开启字幕轨道 */
		setIsSubtitleTrack,
		/** 设置当前 season 的字幕源 */
		setSeasonSubtitleTrack,
		/** 读取当前 season 的字幕源 */
		getSeasonSubtitleTrack,
	};
});

function normalizeVolumePercent(volume: number) {
	return Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 100) : DEFAULT_VOLUME;
}

function isValidPlaybackTime(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
