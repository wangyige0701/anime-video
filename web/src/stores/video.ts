import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useVideoStore = defineStore('video', () => {
	const name = ref('');
	const progress = ref(0);
	const fullTime = ref(0);
	/** 手动更新进度条后的数据，用于触发视频更新 */
	const changedProgress = ref(0);
	// 每1%对应的时间
	const step = computed(() => {
		return Number((fullTime.value / 100).toFixed(2)) || 0;
	});
	// 当前进度对应的时长
	const position = computed(() => {
		if (progress.value >= 100) {
			return fullTime.value;
		}
		if (progress.value <= 0) {
			return 0;
		}
		return Number((progress.value * step.value).toFixed(2)) || 0;
	});

	function setVideo(
		videoName: string,
		fullTimeValue: number,
		defaultProcess = 0,
	) {
		name.value = videoName;
		fullTime.value = fullTimeValue;
		progress.value = defaultProcess;
	}

	function resetProgress() {
		progress.value = 0;
		changedProgress.value = 0;
	}

	/**
	 * @param value 进度值，范围为0-100
	 */
	function setProgress(value: number) {
		console.log(value);
		progress.value = value;
		changedProgress.value = value;
	}

	function setCurrentTime(time: number) {
		if (time >= fullTime.value) {
			setProgress(100);
			return;
		}
		if (time <= 0) {
			setProgress(0);
			return;
		}
		setProgress(Number(((time / fullTime.value) * 100).toFixed(2)) || 0);
	}

	return {
		name,
		progress,
		changedProgress,
		position,
		/**
		 * 设置视频信息
		 */
		setVideo,
		/**
		 * 重置进度
		 */
		resetProgress,
		/**
		 * 设置进度
		 */
		setProgress,
		setCurrentTime,
	};
});
