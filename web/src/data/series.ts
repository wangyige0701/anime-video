import type { Series as ISeries } from '~types/videos';
import { createPromise } from '@wang-yige/utils';
import {
	getSeries,
	getSeriesDetail,
	refreshSeries,
	refreshSeriesById,
	updateSeriesDate,
	updateSeriesDescription,
	updateSeriesImages,
	updateSeriesStatus,
	updateSeriesTitle,
	updateSeriesTypes,
} from '@/api/series';
import { getSeasons } from '@/api/season';
import { Common } from './common';
import { Season } from './season';
import { Episode } from './episode';
import type { ShallowReactive } from 'vue';

const initialize = useVueStatusRef('loading', 'initialized');

export class Series extends Common implements Omit<ISeries, 'seasons'> {
	protected static cache: Map<string, Series> = new Map();
	private static globalWaitPromise: Promise<Series[]> | null = null;

	/**
	 * 请求接口，初始化系列数据
	 */
	public static async initialized() {
		if (initialize.loading) {
			if (!this.globalWaitPromise) {
				throw new Error('全局等待 Promise 不存在');
			}
			return await this.globalWaitPromise;
		}
		if (initialize.initialized) {
			return [...this.cache.values()];
		}
		const { promise, resolve } = createPromise<Series[]>();
		this.globalWaitPromise = promise;
		const result = [] as Series[];
		initialize.onLoading();
		try {
			const series = await getSeries();
			for (const seriesItem of series) {
				result.push(new Series(seriesItem));
			}
			initialize.onInitialized();
		} catch (error) {
			console.error('初始化系列数据失败', error);
		}
		initialize.offLoading();
		resolve(result);
		return result;
	}

	/**
	 * 刷新系列的全部缓存，并重新初始化数据
	 */
	public static async refresh() {
		initialize.offInitialized();
		// 全量刷新后必须丢弃旧的系列、季、集实例，否则构造函数会命中旧缓存而忽略接口新数据。
		this.clearCache();
		Season.clearCache();
		Episode.clearCache();
		await refreshSeries();
		return await this.initialized();
	}

	public static get isInitialized() {
		return initialize.initialized;
	}

	/**
	 * 请求具体系列的详细信息，优先取缓存，没有则请求接口
	 */
	public static async getSeriesDetail(seriesId: string) {
		await this.initialized();
		let series = this.cache.get(seriesId);
		if (!series) {
			// 没有数据时，直接请求详细信息的接口
			const seriesDetail = await getSeriesDetail(seriesId);
			series = new Series(seriesDetail);
			series.setSeasons(
				seriesDetail.seasons.map((season) => {
					const seasonItem = new Season(season);
					seasonItem.setEpisodes(season.episodes.map((episode) => new Episode(episode)));
					return seasonItem;
				}),
			);
			return series;
		}
		if (!series.seasons.length) {
			const seasons = await getSeasons(seriesId);
			series.setSeasons(
				seasons.map((season) => {
					const seasonItem = new Season(season);
					seasonItem.setEpisodes(season.episodes.map((episode) => new Episode(episode)));
					return seasonItem;
				}),
			);
		}
		return series;
	}

	/**
	 * 刷新指定系列的缓存，包括季和集数据，并重新请求系列数据
	 * @param seriesId 系列 ID
	 * @returns 刷新后的系列对象
	 */
	public static async refreshSeries(seriesId: string) {
		if (this.hasCache(seriesId)) {
			const series = this.cache.get(seriesId)!;
			for (const season of series.seasons) {
				for (const episode of season.episodes) {
					Episode.deleteCache(episode.id);
				}
				Season.deleteCache(season.id);
			}
		}
		this.deleteCache(seriesId);
		await refreshSeriesById(seriesId);
		return await this.getSeriesDetail(seriesId);
	}

	public static async getSeriesByPage(page: number, pageSize: number, keyword?: string) {
		await this.initialized();
		const start = (page - 1) * pageSize;
		const end = start + pageSize;
		if (keyword) {
			return [...this.cache.values()]
				.filter((series) => {
					return series.title.includes(keyword) || series.description.includes(keyword);
				})
				.slice(start, end);
		}
		return [...this.cache.values()].slice(start, end);
	}

	private _id: Ref<ISeries['id']> = ref('');
	private _path: Ref<ISeries['path']> = ref('');
	private _name: Ref<ISeries['name']> = ref('');
	private _title: Ref<ISeries['title']> = ref('');
	private _images: Ref<ISeries['images']> = ref([]);
	private _description: Ref<ISeries['description']> = ref('');
	private _date: Ref<ISeries['date']> = ref([]);
	private _types: Ref<ISeries['types']> = ref([]);
	private _status: Ref<ISeries['status']> = ref(0);
	private _seasons: ShallowReactive<{ value: Season[] }> = shallowReactive({ value: [] });

	private useStatus = useVueStatusRef('title', 'images', 'description', 'date', 'types', 'status');

	/**
	 * 系列构造函数，因为季和集需要初始化后才能有数据，所以不要直接实例化系列对象，而是通过静态成员方法获取
	 */
	constructor(series: ISeries) {
		if (Series.cache.has(series.id)) {
			return Series.cache.get(series.id)!;
		}

		super();

		this._id.value = series.id;
		this._path.value = series.path;
		this._name.value = series.name;
		this._title.value = series.title;
		this._images.value = series.images;
		this._description.value = series.description;
		this._date.value = series.date;
		this._types.value = series.types;
		this._status.value = series.status;

		Series.cache.set(series.id, this);
	}

	public setSeasons(seasons: Season[]) {
		this._seasons.value = seasons;
	}

	// region 系列属性值
	public get id() {
		return unref(this._id);
	}

	public get path() {
		return unref(this._path);
	}

	public get name() {
		return unref(this._name);
	}

	public get title() {
		return unref(this._title);
	}

	public get images() {
		return unref(this._images);
	}

	public get description() {
		return unref(this._description);
	}

	public get date() {
		return unref(this._date);
	}

	public get types() {
		return unref(this._types);
	}

	public get status() {
		return unref(this._status);
	}

	public get seasons() {
		return this._seasons.value;
	}
	// endregion

	// region 系列属性更新时的响应式状态
	/**
	 * 系列标题更新时的响应式状态
	 */
	public get titleRef() {
		return this.useStatus.title;
	}

	/**
	 * 系列描述更新时的响应式状态
	 */
	public get descriptionRef() {
		return this.useStatus.description;
	}

	/**
	 * 系列日期更新时的响应式状态
	 */
	public get dateRef() {
		return this.useStatus.date;
	}

	/**
	 * 系列类型更新时的响应式状态
	 */
	public get typesRef() {
		return this.useStatus.types;
	}

	/**
	 * 系列状态更新时的响应式状态
	 */
	public get statusRef() {
		return this.useStatus.status;
	}

	/**
	 * 系列图片更新时的响应式状态
	 */
	public get imagesRef() {
		return this.useStatus.images;
	}
	// endregion

	// region 更新标题
	public async updateTitle(title: string) {
		let oldValue = this._title.value;
		this._title.value = title;
		this.useStatus.onTitle();
		try {
			await updateSeriesTitle(this.id, title);
		} catch (error) {
			this._title.value = oldValue;
		}
		this.useStatus.offTitle();
	}
	// endregion

	// region 更新描述
	public async updateDescription(description: string) {
		let oldValue = this._description.value;
		this._description.value = description;
		this.useStatus.onDescription();
		try {
			await updateSeriesDescription(this.id, description);
		} catch (error) {
			this._description.value = oldValue;
		}
		this.useStatus.offDescription();
	}
	// endregion

	// region 更新日期
	public async updateDate(year: number, month: number) {
		let oldValue = this._date.value;
		this._date.value = [year, month];
		this.useStatus.onDate();
		try {
			await updateSeriesDate(this.id, year, month);
		} catch (error) {
			this._date.value = oldValue;
		}
		this.useStatus.offDate();
	}
	// endregion

	// region 更新类型
	public async addTypes(types: number[]) {
		let oldValue = this._types.value;
		this._types.value = types;
		this.useStatus.onTypes();
		try {
			await updateSeriesTypes('add', this.id, types);
		} catch (error) {
			this._types.value = oldValue;
		}
		this.useStatus.offTypes();
	}

	public async removeTypes(types: number[]) {
		let oldValue = this._types.value;
		this._types.value = types;
		this.useStatus.onTypes();
		try {
			await updateSeriesTypes('remove', this.id, types);
		} catch (error) {
			this._types.value = oldValue;
		}
		this.useStatus.offTypes();
	}

	public async updateTypes(types: number[]) {
		let oldValue = this._types.value;
		this._types.value = types;
		this.useStatus.onTypes();
		try {
			await updateSeriesTypes('set', this.id, types);
		} catch (error) {
			this._types.value = oldValue;
		}
		this.useStatus.offTypes();
	}
	// endregion

	// region 更新图片
	public async addImages(images: string[]) {
		let oldValue = this._images.value;
		this._images.value = images;
		this.useStatus.onImages();
		try {
			await updateSeriesImages('add', this.id, images);
		} catch (error) {
			this._images.value = oldValue;
		}
		this.useStatus.offImages();
	}

	public async removeImages(images: string[]) {
		let oldValue = this._images.value;
		this._images.value = images;
		this.useStatus.onImages();
		try {
			await updateSeriesImages('remove', this.id, images);
		} catch (error) {
			this._images.value = oldValue;
		}
		this.useStatus.offImages();
	}

	public async updateImages(images: string[]) {
		let oldValue = this._images.value;
		this._images.value = images;
		this.useStatus.onImages();
		try {
			await updateSeriesImages('set', this.id, images);
		} catch (error) {
			this._images.value = oldValue;
		}
		this.useStatus.offImages();
	}
	// endregion

	// region 更新状态
	public async updateStatus(status: number) {
		let oldValue = this._status.value;
		this._status.value = status;
		this.useStatus.onStatus();
		try {
			await updateSeriesStatus(this.id, status);
		} catch (error) {
			this._status.value = oldValue;
		}
		this.useStatus.offStatus();
	}
	// endregion
}
