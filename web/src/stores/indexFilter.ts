import { INDEX_FILTER_STORAGE_KEY } from '@/config/constants';
import { VideoInfoStorage } from '@/utils/videoInfoStorage';
import {
	createDefaultSeriesQuery,
	normalizeDateRange,
	type SeriesDateRange,
	type SeriesFilterMode,
	type SeriesQuery,
	type SeriesSortMode,
} from '@/utils/seriesQuery';

/** 过滤方式白名单，用于校正本地存储中的脏数据 */
const FILTER_MODES: SeriesFilterMode[] = ['types', 'status', 'date'];

/** 排序方式白名单 */
const SORT_MODES: SeriesSortMode[] = ['date', 'name'];

/** 本地存储中的筛选状态结构 */
interface StoredIndexFilter {
	mode: SeriesFilterMode;
	sortMode: SeriesSortMode;
	types: number[];
	statuses: number[];
	dateRange: SeriesDateRange | null;
}

/**
 * 只接受有限数字组成的数组，过滤掉反序列化产生的脏值。
 */
function toNumberArray(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

/**
 * 首页的过滤与排序状态。
 *
 * 设计要点：
 * - 过滤与排序全部在前端本地完成，store 只保存「用户选择了什么」；
 * - 状态写入本地存储，刷新页面后保持上次的选择；
 * - `query` 是列表唯一依赖的查询条件，`signature` 用于判断条件是否真的变化。
 */
export const useIndexFilterStore = defineStore('indexFilter', () => {
	const mode = ref<SeriesFilterMode>('types');
	const sortMode = ref<SeriesSortMode>('date');
	const types = ref<number[]>([]);
	const statuses = ref<number[]>([]);
	const dateRange = ref<SeriesDateRange | null>(null);
	/** 是否已经从本地存储恢复完成 */
	const ready = ref(false);
	let initializing: Promise<void> | null = null;

	const query = computed<SeriesQuery>(() => ({
		sortMode: sortMode.value,
		types: types.value,
		statuses: statuses.value,
		dateRange: dateRange.value,
	}));

	/** 查询条件签名，列表通过它判断是否需要重新加载 */
	const signature = computed(() => JSON.stringify(query.value));

	/** 是否存在生效中的过滤条件，用于过滤栏提示 */
	const hasFilter = computed(() => types.value.length > 0 || statuses.value.length > 0 || !!dateRange.value);

	/**
	 * 恢复本地存储中的筛选状态。
	 *
	 * 并发调用共享同一个 Promise，避免重复读取；存储不可用时回退到默认值。
	 */
	async function initialize() {
		if (ready.value) {
			return;
		}
		if (!initializing) {
			initializing = (async () => {
				const stored = await VideoInfoStorage.get<StoredIndexFilter | null>(INDEX_FILTER_STORAGE_KEY, null);
				if (stored && typeof stored === 'object') {
					mode.value = FILTER_MODES.includes(stored.mode) ? stored.mode : 'types';
					sortMode.value = SORT_MODES.includes(stored.sortMode) ? stored.sortMode : 'date';
					types.value = toNumberArray(stored.types);
					statuses.value = toNumberArray(stored.statuses);
					dateRange.value = normalizeDateRange(stored.dateRange);
				}
				ready.value = true;
				initializing = null;
			})();
		}
		await initializing;
	}

	/**
	 * 重置为默认状态：清空过滤条件并按上线时间排序。
	 *
	 * 过滤方式本身属于用户习惯，重置时保留。
	 */
	function reset() {
		const defaults = createDefaultSeriesQuery();
		sortMode.value = defaults.sortMode;
		types.value = [];
		statuses.value = [];
		dateRange.value = null;
	}

	function setMode(value: SeriesFilterMode) {
		mode.value = value;
	}

	function setSortMode(value: SeriesSortMode) {
		sortMode.value = value;
	}

	function setTypes(value: number[]) {
		types.value = [...value];
	}

	function setStatuses(value: number[]) {
		statuses.value = [...value];
	}

	function setDateRange(value: SeriesDateRange | null) {
		dateRange.value = normalizeDateRange(value);
	}

	// 状态变化即写入本地存储；初始化期间 ready 仍为 false，不会把恢复出来的值立即回写
	watch(
		[mode, sortMode, types, statuses, dateRange],
		() => {
			if (!ready.value) {
				return;
			}
			const snapshot: StoredIndexFilter = {
				mode: mode.value,
				sortMode: sortMode.value,
				types: types.value,
				statuses: statuses.value,
				dateRange: dateRange.value,
			};
			void VideoInfoStorage.set(INDEX_FILTER_STORAGE_KEY, snapshot, true);
		},
		{ deep: true },
	);

	return {
		mode,
		sortMode,
		types,
		statuses,
		dateRange,
		ready,
		query,
		signature,
		hasFilter,
		initialize,
		reset,
		setMode,
		setSortMode,
		setTypes,
		setStatuses,
		setDateRange,
	};
});
