import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useVideoStore = defineStore('video', () => {
	const _fullTime = ref(0);
	const name = ref('');
	const process = ref(0);
	const changedProcess = ref(0);
	// 每1%对应的时间
	const step = computed(() => {
		return Number((_fullTime.value / 100).toFixed(2)) || 0;
	});
	// 当前进度对应的时长
	const position = computed(() => {
		if (process.value >= 100) {
			return _fullTime.value;
		}
		if (process.value <= 0) {
			return 0;
		}
		return Number((process.value * step.value).toFixed(2)) || 0;
	});

	function setVideo(videoName: string, fullTime: number, defaultProcess = 0) {
		name.value = videoName;
		_fullTime.value = fullTime;
		process.value = defaultProcess;
	}

	function resetProcess() {
		process.value = 0;
		changedProcess.value = 0;
	}

	/**
	 * @param value 进度值，范围为0-100
	 */
	function setProcess(value: number) {
		process.value = value;
		changedProcess.value = value;
	}

	function setCurrentTime(time: number) {
		if (time >= _fullTime.value) {
			setProcess(100);
			return;
		}
		if (time <= 0) {
			setProcess(0);
			return;
		}
		setProcess(Number(((time / _fullTime.value) * 100).toFixed(2)) || 0);
	}

	return {
		name,
		process,
		changedProcess,
		position,
		/**
		 * 设置视频信息
		 */
		setVideo,
		/**
		 * 重置进度
		 */
		resetProcess,
		/**
		 * 设置进度
		 */
		setProcess,
		setCurrentTime,
	};
});
