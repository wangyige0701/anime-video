import { subscribeSystemInfo, type SystemInfo } from '@/api/system';

export const useSystemStore = defineStore('system', () => {
	const systemInfo = ref<SystemInfo | null>(null);
	let stopSubscription: (() => void) | undefined;

	function start() {
		stop();
		stopSubscription = subscribeSystemInfo((info) => {
			systemInfo.value = info;
		});
	}

	function stop() {
		stopSubscription?.();
		stopSubscription = undefined;
	}

	return {
		systemInfo,
		start,
		stop,
	};
});
