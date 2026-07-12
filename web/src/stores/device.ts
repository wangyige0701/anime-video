import { throttle } from '@wang-yige/utils';

export const useDeviceStore = defineStore('device', () => {
	const isMobile = ref(false);
	const isDesktop = ref(true);
	const className = computed(() => {
		return isMobile.value ? 'mobile' : 'desktop';
	});

	function resize() {
		const width = window.innerWidth;
		isMobile.value = width < 768;
		isDesktop.value = width >= 768;
	}

	const resizeFunc = throttle(resize, 300);
	resizeFunc();
	window.addEventListener('resize', resizeFunc);

	return {
		isMobile,
		isDesktop,
		className,
	};
});
