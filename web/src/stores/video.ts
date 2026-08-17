import { Series } from '@/data/series';

export const useVideoStore = defineStore('video', () => {
	const currentSeries = ref<{ value: Series | undefined }>({ value: void 0 });

	function setCurrentSeries(series: Series) {
		currentSeries.value.value = series;
	}

	function resetCurrentSeries() {
		currentSeries.value.value = void 0;
	}

	async function initialize() {
		return await Series.initialized();
	}

	async function getSeriesDetail(seriesId: string) {
		return await Series.getSeriesDetail(seriesId);
	}

	async function refresh() {
		return await Series.refresh();
	}

	async function refreshSeries(seriesId: string) {
		return await Series.refreshSeries(seriesId);
	}

	async function pagination(page: number, pageSize: number, keyword?: string) {
		return await Series.getSeriesByPage(page, pageSize, keyword);
	}

	return {
		currentSeries,
		setCurrentSeries,
		resetCurrentSeries,
		initialize,
		getSeriesDetail,
		refresh,
		refreshSeries,
		pagination,
	};
});
