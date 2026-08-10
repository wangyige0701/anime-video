import type { VideoPlayData } from '@/@types/video';
import Hls from 'hls.js';

export const usePlayerStore = defineStore('player', () => {
	const isSupportedHls = Hls.isSupported();
	let video = document.createElement('video');
	const isSupportedNative = video.canPlayType('application/vnd.apple.mpegurl');
	video.remove();
	(video as unknown) = null;

	const isPlaying = ref(false);
	const seriesTitle = ref('');
	const seasonTitle = ref('');
	const episodeTitle = ref('');
	const videoPath = ref('');
	const currentTime = ref(0);

	function setVideo(data: VideoPlayData) {
		seriesTitle.value = data.seriesTitle;
		seasonTitle.value = data.seasonTitle;
		episodeTitle.value = data.episodeTitle;
		videoPath.value = data.videoPath;
		currentTime.value = data.currentTime ?? 0;
		if (currentTime.value < 0) {
			currentTime.value = 0;
		}
	}

	function setCurrentTime(time: number) {
		currentTime.value = time;
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

	function reset() {
		isPlaying.value = false;
		seriesTitle.value = '';
		seasonTitle.value = '';
		episodeTitle.value = '';
		videoPath.value = '';
		currentTime.value = 0;
	}

	return {
		isPlaying,
		seriesTitle,
		seasonTitle,
		episodeTitle,
		videoPath,
		currentTime,
		/**
		 * 是否支持 HLS
		 */
		isSupportedHls,
		/**
		 * Safari 原生支持 HLS
		 */
		isSupportedNative,
		/**
		 * 设置视频信息
		 */
		setVideo,
		/**
		 * 播放视频
		 */
		play,
		/**
		 * 暂停视频
		 */
		pause,
		/**
		 * 切换播放状态
		 */
		togglePlay,
		/**
		 * 设置当前播放时间
		 */
		setCurrentTime,
		/**
		 * 重置播放信息
		 */
		reset,
	};
});
