import type { Series as ISeries } from '~types/videos';
import { ref, unref } from 'vue';
import { createPromise, type Fn } from '@wang-yige/utils';
import {
	removeSeriesStatus,
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
	removeSeriesDate,
} from '@/api/series';
import { getSeasons } from '@/api/season';
import { applySeriesQuery, paginateSeries, type SeriesQuery } from '@/utils/seriesQuery';
import { getSeriesImageName, mergeUnique } from '@/utils/series';
import { Common, patchField, serverTitle, type FieldRefs } from './common';
import { Season } from './season';
import { Episode } from './episode';

type SeriesValue = Omit<ISeries, 'seasons'>;

const initialize = useVueStatusRef('loading', 'initialized');

export class Series extends Common implements SeriesValue {
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
			const compareController = new Intl.Collator('zh-CN-u-co-pinyin', {
				usage: 'sort',
				sensitivity: 'base',
				numeric: true,
			});
			series.sort((a, b) => compareController.compare(a.title, b.title));
			for (const seriesItem of series) {
				result.push(new Series(seriesItem));
			}
			initialize.onInitialized();
		} catch (error: any) {
			ElMessage.error('初始化系列数据失败' + (error?.message || ''));
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
		const series = await refreshSeries();
		this.filterBindCache(series.map((item) => item.id));
		const result = series.map((item) => new Series(item));
		initialize.onInitialized();
		return result;
	}

	public static get isInitialized() {
		return initialize.initialized;
	}

	/**
	 * 是否正在请求全量系列数据。
	 *
	 * 首屏加载遮罩依赖该状态：请求期间即使已经有部分界面可渲染，
	 * 也不应该让用户看到空列表再突然填充。
	 */
	public static get isLoading() {
		return initialize.loading;
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

	public static async getSeriesByPage(
		page: number,
		pageSize: number,
		keyword?: string,
		query?: Partial<SeriesQuery>,
	) {
		const list = await this.querySeries(keyword, query);
		return paginateSeries(list, page, pageSize);
	}

	/**
	 * 获取全部系列（不含季集详情），供时间轴等需要完整范围的场景使用。
	 */
	public static async getAllSeries() {
		await this.initialized();
		return [...this.cache.values()];
	}

	/**
	 * 按关键词、过滤条件与排序方式返回完整结果列表。
	 *
	 * 过滤和排序都在前端本地完成，接口只提供全量数据；
	 * 分页交给 `getSeriesByPage()`，避免两处重复实现同一条流水线。
	 */
	public static async querySeries(keyword = '', query?: Partial<SeriesQuery>) {
		const list = await this.getAllSeries();
		return applySeriesQuery(list, keyword, query);
	}

	private values: FieldRefs<SeriesValue> = {
		id: ref(''),
		path: ref(''),
		name: ref(''),
		title: ref(''),
		images: ref<string[]>([]),
		description: ref(''),
		date: ref<[number?, number?]>([]),
		types: ref<number[]>([]),
		status: ref(0),
	};

	private requestStatus = this.createStatus('title', 'images', 'description', 'date', 'types', 'status');

	private _seasons!: Ref<Season[]>;
	private seasonsTrack!: Fn<[]>;
	private seasonsUpdate!: Fn<[Season[]]>;

	/**
	 * 系列构造函数，因为季和集需要初始化后才能有数据，所以不要直接实例化系列对象，而是通过静态成员方法获取
	 */
	constructor(series: ISeries) {
		if (Series.cache.has(series.id)) {
			return Series.cache.get(series.id)!;
		}

		super();

		for (const key of Object.keys(this.values) as Array<keyof SeriesValue>) {
			(this.values[key] as Ref<unknown>).value = series[key];
		}

		if (!Series.hasBindCache(series.id)) {
			const { ref, track, update } = Series.createRef<Season>();
			this.seasonsTrack = track;
			this.seasonsUpdate = update;
			this._seasons = ref;
			Series.setBindCache(series.id, { ref, track, update });
		} else {
			const { ref, track, update } = Series.getBindCache<Season>(series.id)!;
			this._seasons = ref;
			this.seasonsTrack = track;
			this.seasonsUpdate = update;
		}

		Series.cache.set(series.id, this);
	}

	public setSeasons(seasons: Season[]) {
		this.seasonsUpdate(seasons);
	}

	// region 系列属性值
	public get id() {
		return this.values.id.value;
	}

	public get path() {
		return this.values.path.value;
	}

	public get name() {
		return this.values.name.value;
	}

	public get title() {
		return this.values.title.value;
	}

	public get images() {
		return this.values.images.value;
	}

	public get description() {
		return this.values.description.value;
	}

	public get date() {
		return this.values.date.value;
	}

	public get types() {
		return this.values.types.value;
	}

	public get status() {
		return this.values.status.value;
	}

	public get seasons() {
		this.seasonsTrack();
		return unref(this._seasons);
	}
	// endregion

	// region 系列属性更新时的响应式状态
	/**
	 * 系列标题更新时的响应式状态
	 */
	public get titleRef() {
		return this.requestStatus.get('title');
	}

	/**
	 * 系列描述更新时的响应式状态
	 */
	public get descriptionRef() {
		return this.requestStatus.get('description');
	}

	/**
	 * 系列日期更新时的响应式状态
	 */
	public get dateRef() {
		return this.requestStatus.get('date');
	}

	/**
	 * 系列类型更新时的响应式状态
	 */
	public get typesRef() {
		return this.requestStatus.get('types');
	}

	/**
	 * 系列状态更新时的响应式状态
	 */
	public get statusRef() {
		return this.requestStatus.get('status');
	}

	/**
	 * 系列图片更新时的响应式状态
	 */
	public get imagesRef() {
		return this.requestStatus.get('images');
	}
	// endregion

	// region 更新标题
	/** 标题允许为空：服务端会还原为默认标题，并用返回值纠正本地值 */
	public async updateTitle(title: string) {
		const next = title.trim();
		await patchField(
			this.values,
			this.requestStatus,
			'title',
			next,
			() => updateSeriesTitle(this.id, next),
			serverTitle,
		);
	}
	// endregion

	// region 更新描述
	public async updateDescription(description: string) {
		await patchField(this.values, this.requestStatus, 'description', description, () =>
			updateSeriesDescription(this.id, description),
		);
	}
	// endregion

	// region 更新日期
	public async updateDate(year: number, month: number) {
		await patchField(this.values, this.requestStatus, 'date', [year, month], () =>
			updateSeriesDate(this.id, year, month),
		);
	}
	// endregion

	// region 删除日期
	public async removeDate() {
		await this.requestStatus.run('date', async () => {
			try {
				await removeSeriesDate(this.id);
				this.values.date.value = [];
			} catch (error) {}
		});
	}
	// endregion

	// region 更新类型
	/**
	 * 追加类型，服务端为追加语义，本地按同一语义合并后去重
	 */
	public async addTypes(types: number[]) {
		await patchField(this.values, this.requestStatus, 'types', mergeUnique(this.types, types), () =>
			updateSeriesTypes('add', this.id, types),
		);
	}

	/**
	 * 移除类型，服务端为过滤语义，本地同步剔除
	 */
	public async removeTypes(types: number[]) {
		await patchField(
			this.values,
			this.requestStatus,
			'types',
			this.types.filter((type) => !types.includes(type)),
			() => updateSeriesTypes('remove', this.id, types),
		);
	}

	public async updateTypes(types: number[]) {
		await patchField(this.values, this.requestStatus, 'types', types, () =>
			updateSeriesTypes('set', this.id, types),
		);
	}
	// endregion

	// region 更新图片
	/**
	 * 追加图片，入参为绝对路径，接口只接受系列目录内的文件名
	 */
	public async addImages(images: string[]) {
		await patchField(this.values, this.requestStatus, 'images', mergeUnique(this.images, images), () =>
			updateSeriesImages('add', this.id, this.toImageNames(images)),
		);
	}

	/**
	 * 移除图片，入参为绝对路径，接口只接受系列目录内的文件名
	 */
	public async removeImages(images: string[]) {
		await patchField(
			this.values,
			this.requestStatus,
			'images',
			this.images.filter((image) => !images.includes(image)),
			() => updateSeriesImages('remove', this.id, this.toImageNames(images)),
		);
	}

	/**
	 * 覆盖图片顺序，入参为绝对路径，接口只接受系列目录内的文件名
	 */
	public async updateImages(images: string[]) {
		await patchField(this.values, this.requestStatus, 'images', images, () =>
			updateSeriesImages('set', this.id, this.toImageNames(images)),
		);
	}

	private toImageNames(images: string[]) {
		return images.map((image) => getSeriesImageName(this.path, image));
	}
	// endregion

	// region 更新状态
	public async updateStatus(status: number) {
		await patchField(this.values, this.requestStatus, 'status', status, () => updateSeriesStatus(this.id, status));
	}
	// endregion

	// region 删除状态
	public async removeStatus() {
		await patchField(this.values, this.requestStatus, 'status', 0, () => removeSeriesStatus(this.id));
	}
	// endregion
}
