import type { Series as ISeries } from '~types/videos';
import { getSeries } from '~web/src/api/series';
import { createPromise } from '@wang-yige/utils';
import { getSeasons } from '~web/src/api/season';
import { getEpisodes } from '~web/src/api/episode';
import { Common } from './common';
import { Season } from './season';
import { Episode } from './episode';

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
			initialize.onInitialized();
			for (const seriesItem of series) {
				result.push(new Series(seriesItem));
			}
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
		return await this.initialized();
	}

	/**
	 * 请求具体系列的详细信息，优先取缓存，没有则请求接口
	 */
	public static async getSeriesDetail(seriesId: string) {
		await this.initialized();
		const series = this.cache.get(seriesId);
		if (!series) {
			throw new Error(`系列 ${seriesId} 不存在`);
		}
		if (!series.seasons.length) {
			try {
				const seasonsData = await getSeasons(seriesId);
				// 读取季和集数据
				const seasons = await Promise.all(
					seasonsData.map(async (seasonData) => {
						const season = new Season(seasonData);
						if (season.episodes.length) {
							return season;
						}
						const episodes = await getEpisodes(season.id);
						season.setEpisodes(episodes.map((episode) => new Episode(episode)));
						return season;
					}),
				);
				series.seasons.splice(0, series.seasons.length, ...seasons);
			} catch (error) {
				console.error('获取系列季数据失败', error);
			}
		}
		return series;
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
	private _seasons: ShallowRef<Season[]> = shallowRef([]);

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

	// region 系列属性值
	public get id() {
		return this._id.value;
	}

	public get path() {
		return this._path.value;
	}

	public get name() {
		return this._name.value;
	}

	public get title() {
		return this._title.value;
	}

	public get images() {
		return this._images.value;
	}

	public get description() {
		return this._description.value;
	}

	public get date() {
		return this._date.value;
	}

	public get types() {
		return this._types.value;
	}

	public get status() {
		return this._status.value;
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
}
