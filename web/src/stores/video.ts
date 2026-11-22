import type { SeriesQuery } from '@/utils/seriesQuery';
import { Series } from '@/data/series';

export const useVideoStore = defineStore('video', () => {
	/** 全量系列数据是否正在请求，首屏遮罩依赖它 */
	const loading = computed(() => Series.isLoading);
	/** 全量系列数据是否已经完成初始化 */
	const initialized = computed(() => Series.isInitialized);

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

	async function pagination(page: number, pageSize: number, keyword?: string, query?: Partial<SeriesQuery>) {
		return await Series.getSeriesByPage(page, pageSize, keyword, query);
	}

	/**
	 * 获取全部系列，供时间轴等需要完整数据范围的组件使用。
	 */
	async function all() {
		return await Series.getAllSeries();
	}

	/**
	 * 按过滤条件与排序方式获取完整列表（不分页）。
	 */
	async function query(keyword?: string, query?: Partial<SeriesQuery>) {
		return await Series.querySeries(keyword, query);
	}

	return {
		loading,
		initialized,
		initialize,
		getSeriesDetail,
		refresh,
		refreshSeries,
		pagination,
		all,
		query,
	};
});
