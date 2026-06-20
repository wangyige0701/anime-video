import { Series } from '@/data/series';

export const useVideoStore = defineStore('video', () => {
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

	async function pagination(page: number, pageSize: number) {
		return await Series.getSeriesByPage(page, pageSize);
	}

	return {
		initialize,
		getSeriesDetail,
		refresh,
		refreshSeries,
		pagination,
	};
});
