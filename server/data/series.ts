import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Series as ISeries, SeriesImagesStoreStruct } from '~types/videos';
import { NotFoundError } from '~server/src/error/notFound';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Data } from './data';
import { Season } from './season';
import { Episode } from './episode';
import { Entity, type ServerToPromise } from './entity';
import { mapWithConcurrency } from '~server/src/utils/concurrency';

const SERVER = __APP_CONFIG__.server;
const DATA_FILE = SERVER.videoConfigPrefix + SERVER.dataFile;

/**
 * 首次扫描的并发上限。
 *
 * 每个系列初始化都要读取数据文件、扫描图片目录，全串行时总耗时随系列数量线性增长；
 * 并发过高又会一次占用过多文件句柄，8 路在本地磁盘上是较稳的折中。
 */
const SERIES_SCAN_CONCURRENCY = 8;

type SeriesStore = Omit<ISeries, 'images'> & { images: SeriesImagesStoreStruct };
type SeriesValue = Omit<ISeries, 'seasons'>;

/**
 * Series / Season / Episode 在更新属性时，没有去等待文件写入完成，因为数据记录在内存中完成，写文件是延迟操作，所以为了尽快完成数据更新，文件写入会放到后自动执行
 */
export class Series extends Entity<SeriesStore, SeriesValue> implements ServerToPromise<SeriesValue> {
	/**
	 * 视频系列缓存，key 为视频系列 id，value 为视频系列实例
	 */
	protected static cache: Map<string, Series> = new Map();
	// 首次扫描完成后，普通读取复用索引；文件系统变化由刷新接口主动对账。
	private static isIndexed = false;

	/** 对外 DTO 字段，顺序与 `getValue()` 的键顺序一致 */
	private static readonly VALUE_FIELDS = [
		'id',
		'path',
		'name',
		'title',
		'images',
		'description',
		'date',
		'types',
		'status',
	] as const;

	public static async clearCache() {
		for (const [_key, series] of this.cache) {
			// 循环移除系列目录下的其它缓存
			const seasons = await series.seasons;
			for (const season of seasons) {
				await Season.clearCache();
			}
		}
		this.cache.clear();
		this.isIndexed = false;
	}

	public static async deleteCache(id: string) {
		if (!this.cache.has(id)) {
			return;
		}
		const series = this.cache.get(id)!;
		// 循环移除系列目录下的其它缓存
		const seasons = await series.seasons;
		for (const season of seasons) {
			await Season.deleteCache(await season.id);
		}
		this.cache.delete(id);
		this.isIndexed = false;
	}

	/**
	 * 获取所有视频系列实例
	 *
	 * @param forceRefresh 是否重新扫描磁盘并对账缓存
	 */
	public static async getAllSeries(forceRefresh = false) {
		if (this.isIndexed && !forceRefresh) {
			return [...this.cache.values()];
		}
		const directories = await this.getDirectories();
		const result: Series[] = [];
		for (const directory of directories) {
			if (!(await isFileExist(directory)) || !(await isDirectory(directory))) {
				continue;
			}

			const temp = [] as Series[];

			// Dirent 可直接提供大多数目录项的类型，避免为每一个普通文件额外 stat 一次。
			// 系列初始化是多次文件系统调用的组合，串行会让首次扫描耗时随系列数量线性增长，
			// 因此按固定并发上限并行执行，结果顺序仍与目录顺序一致。
			const entries = (await fs.readdir(directory, { withFileTypes: true })).filter((entry) => {
				return entry.isDirectory() || entry.isSymbolicLink();
			});
			const initialized = await mapWithConcurrency(entries, SERIES_SCAN_CONCURRENCY, async (entry) => {
				const entryPath = path.join(directory, entry.name);
				// 符号链接仍回退到 stat，以保持此前可扫描链接目录的兼容行为。
				if (entry.isSymbolicLink() && !(await isDirectory(entryPath))) {
					return null;
				}
				const series = new Series(directory, entry.name);
				await series.getPromise();
				return series;
			});
			for (const series of initialized) {
				if (series) {
					temp.push(series);
				}
			}

			// 从原配置数据中移除不存在的系列数据
			// 如果有新增的已经在 resolveSeriesConfig 中添加过了，这里只需要移除不存在的系列数据
			const data = Data.instance<ISeries[]>(path.join(directory, DATA_FILE), []);
			const currentSeries = await data.read();
			const ids = new Set(await Promise.all(temp.map((item) => item.id)));
			for (let i = currentSeries.length - 1; i >= 0; i--) {
				const series = currentSeries[i];
				if (!ids.has(series.id)) {
					currentSeries.splice(i, 1);
				}
			}
			await data.save();
			// 磁盘中已删除的目录不能继续由静态缓存返回。
			for (const [id, cached] of this.cache) {
				if (path.dirname(cached.getDirectory()) === path.resolve(directory) && !ids.has(id)) {
					await this.deleteCache(id);
				}
			}

			result.push(...temp);
		}

		this.isIndexed = true;
		return result;
	}

	/**
	 * 刷新所有视频系列信息，移除不存在于配置目录中的视频系列，并更新视频系列信息
	 *
	 * @param seriesId 视频系列 id，如果指定，只刷新该系列的缓存
	 */
	public static async updateSeries(seriesId?: string) {
		// 移除不存在于配置目录中的视频系列
		for (const [key, series] of this.cache) {
			if (seriesId && key !== seriesId) {
				continue;
			}
			const seriesPath = series.getDirectory();
			if (!(await this.isAllowedDirectory(seriesPath)) || !(await isDirectory(seriesPath))) {
				await this.deleteCache(key);
			}
		}
		const allSeries = await this.getAllSeries(true);
		const dataInstances = new Set<Data<SeriesStore[]>>();
		for (const series of allSeries) {
			if (seriesId && (await series.id) !== seriesId) {
				continue;
			}
			await series.refreshConfig();
			dataInstances.add(series.getDataInstance());
			for (const season of await Season.getAllSeasons(series)) {
				await Episode.getAllEpisodes(season);
			}
		}
		await Promise.all([...dataInstances].map((data) => data.save()));
	}

	/**
	 * 根据视频系列 id 获取视频系列实例
	 *
	 * @param seriesId 视频系列 id
	 */
	public static async getSeriesById(seriesId: string) {
		if (this.hasCache(seriesId)) {
			const series = this.getCache<Series>(seriesId)!;
			const seriesPath = series.getDirectory();
			// 缓存只保存内存对象，文件系统被外部删除后必须在读取时再次确认有效性。
			if ((await this.isAllowedDirectory(seriesPath)) && (await isDirectory(seriesPath))) {
				return series;
			}
			await this.deleteCache(seriesId);
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			if ((await series.id) === seriesId) {
				return series;
			}
		}
		throw new NotFoundError('Not Found', `没有找到 id 为 ${seriesId} 的视频系列`, 'text/plain');
	}

	/**
	 * 根据视频季 id 获取视频季实例
	 *
	 * @param seasonId 视频季 id
	 */
	public static async getSeasonById(seasonId: string) {
		if (Season.hasCache(seasonId)) {
			const season = Season.getCache<Season>(seasonId)!;
			if ((await this.isAllowedDirectory(season.getDirectory())) && (await isDirectory(season.getDirectory()))) {
				return season;
			}
			await Season.deleteCache(seasonId);
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			const seasons = await series.seasons;
			for (const season of seasons) {
				if ((await season.id) === seasonId) {
					return season;
				}
			}
		}
		throw new NotFoundError('Not Found', `没有找到 id 为 ${seasonId} 的视频季`, 'text/plain');
	}

	/**
	 * 根据视频集 id 获取视频集实例
	 *
	 * @param episodeId 视频集 id
	 */
	public static async getEpisodeById(episodeId: string) {
		if (Episode.hasCache(episodeId)) {
			const episode = Episode.getCache<Episode>(episodeId)!;
			if (
				(await this.isAllowedDirectory(episode.getDirectory())) &&
				(await isFileExist(episode.getDirectory()))
			) {
				return episode;
			}
			await Episode.deleteCache(episodeId);
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			const seasons = await Season.getAllSeasons(series);
			for (const season of seasons) {
				const episodes = await Episode.getAllEpisodes(season);
				for (const episode of episodes) {
					if ((await episode.id) === episodeId) {
						return episode;
					}
				}
			}
		}
		throw new NotFoundError('Not Found', `没有找到 id 为 ${episodeId} 的视频集`, 'text/plain');
	}

	private seriesName!: string;
	private directory!: string;
	private dataFile!: string;
	private hashId!: string;
	private seasonSortQueue: Promise<void> = Promise.resolve();
	private seasonPromise?: Promise<Season[]>;

	/**
	 * @param rootDirectory 视频系列根目录绝对路径
	 * @param seriesName 视频系列名称，可以为空，此时 rootDirectory 为视频系列目录绝对路径
	 */
	constructor(rootDirectory: string, seriesName: string) {
		const directory = path.join(rootDirectory, seriesName);
		const id = Series.hash(directory);
		if (Series.cache.has(id)) {
			return Series.cache.get(id)!;
		}

		super();

		Series.cache.set(id, this);

		this.directory = directory;
		this.seriesName = path.basename(directory);
		this.hashId = id;
		this.dataFile = path.resolve(this.directory, '..', DATA_FILE);

		const { resolve, reject, promise } = createPromise<SeriesStore>();
		this.store = promise;
		// 季关系在构造时即开始派生（与原 registerSeasons 的时机一致），
		// 缓存回收等清理路径读取的是已完成或进行中的扫描结果。
		this.seasonPromise = promise.then(() => Season.getAllSeasons(this));
		const fail: PromiseReject = (error) => {
			// 初始化失败的 Promise 不能留在缓存中，否则后续访问会一直复用失败结果。
			Series.cache.delete(id);
			reject(error);
		};

		this.initialize(resolve, fail).catch(fail);
	}

	/**
	 * 获取视频系列信息，包含视频季和视频集信息
	 */
	public async getValue(): Promise<ISeries> {
		const [value, seasons] = await Promise.all([
			this.collect(Series.VALUE_FIELDS),
			this.seasons.then((seasons) => Promise.all(seasons.map((season) => season.getValue()))),
		]);
		return { ...value, seasons };
	}

	/**
	 * 获取视频系列信息，不包含视频季信息
	 */
	public async getValueOmitSeasons(): Promise<SeriesValue> {
		return await this.collect(Series.VALUE_FIELDS);
	}

	public toJSON() {
		return `[series ${this.seriesName}]`;
	}

	public getSeriesName() {
		return this.seriesName;
	}

	/**
	 * 获取视频系列目录绝对路径
	 */
	public getDirectory() {
		return this.directory;
	}

	public getConfig() {
		return this.store;
	}

	public getDataInstance() {
		return Data.instance<SeriesStore[]>(this.dataFile, []);
	}

	/**
	 * 等待数据保存完成
	 */
	public async waitDataSave() {
		return await this.getDataInstance().save();
	}

	/**
	 * 获取系列初始化的 promise 示例，可以判断内部是否出现异常
	 */
	public getPromise() {
		return this.store;
	}

	// region 属性代理
	public get id() {
		return this.field('id');
	}

	public get path() {
		return this.field('path');
	}

	public get name() {
		return this.field('name');
	}

	public get title() {
		return this.field('title');
	}

	public get images() {
		// 排序基于副本，避免读取时改写配置数组顺序。
		return this.field('images', (store) =>
			store.images
				.slice()
				.sort((a, b) => a.sort - b.sort)
				.map((image) => path.join(this.directory, image.path)),
		);
	}

	public get description() {
		return this.field('description');
	}

	public get date() {
		return this.field('date');
	}

	public get types() {
		return this.field('types');
	}

	public get status() {
		return this.field('status');
	}

	public get seasons() {
		return (this.seasonPromise ??= this.store.then(() => Season.getAllSeasons(this)));
	}
	// endregion

	/** 配置被原地改写后，系列字段与季关系都需要重新派生 */
	protected invalidate() {
		// 关系 Promise 与字段缓存一起失效，并按构造时的时机重新开始扫描。
		this.seasonPromise = this.store.then(() => Season.getAllSeasons(this));
		// 字段缓存由基类按 key 管理。
		super.invalidate();
	}

	// region 更新数据方法，更新后会自动派生对应 get 属性
	/**
	 * 更新系列标题。
	 *
	 * 空字符串（含纯空白）表示恢复默认标题，即系列目录名。与 `resolveTitleConfig()`
	 * 的 `config.title || name` 同一规则，保证写入结果与刷新后的解析结果一致。
	 */
	public async updateTitle(title: string) {
		await this.write('title', title.trim() || (await this.name));
	}

	public async updateDescription(description: string) {
		await this.write('description', description);
	}

	/**
	 * 更新视频系列图片，可以用来更新排序
	 *
	 * @param imageNames 图片名称数组，仅更新位于当前系列目录下的图片，不要传绝对路径
	 */
	public async updateImages(imageNames: string[]) {
		const filterImages = await this.filterImageNames(imageNames);
		if (!filterImages.length) {
			return;
		}
		await this.write(
			'images',
			filterImages.map((image, index) => {
				return { path: path.basename(image), sort: index + 1 } satisfies SeriesImagesStoreStruct[number];
			}),
		);
	}

	/**
	 * 向视频系列中添加图片数据
	 *
	 * @param imageNames 图片名称数组，仅添加位于当前系列目录下的图片，不要传绝对路径
	 */
	public async addImages(imageNames: string[]) {
		if (!imageNames.length) {
			return;
		}
		const filterImages = await this.filterImageNames(imageNames);
		if (!filterImages.length) {
			return;
		}
		await this.mutate('images', (images) => {
			const maxSort = Math.max(1, ...images.map((image) => image.sort));
			images.push(
				...filterImages.map((image, index) => {
					return {
						path: path.basename(image),
						sort: maxSort + index + 1,
					} satisfies SeriesImagesStoreStruct[number];
				}),
			);
		});
	}

	/**
	 * 从视频系列中移除指定图片
	 *
	 * @param imageNames 图片名称数组，仅删除位于当前系列目录下的图片，不要传绝对路径
	 */
	public async removeImages(imageNames: string[]) {
		if (!imageNames.length) {
			return;
		}
		const filterImages = imageNames.filter((image) => image).map((image) => path.basename(image));
		const oldImages = await this.imagesRaw();
		const newImages = [] as SeriesImagesStoreStruct;
		for (const image of oldImages) {
			if (!filterImages.find((img) => img === image.path)) {
				newImages.push({ path: image.path, sort: newImages.length + 1 });
			}
		}
		if (oldImages.length !== newImages.length) {
			await this.write('images', newImages);
		}
	}

	public async updateDate(year: number, month: number) {
		await this.write('date', [year, month]);
	}

	public async removeDate() {
		await this.write('date', []);
	}

	public async updateTypes(types: number[]) {
		await this.write('types', types);
	}

	public async addTypes(types: number[]) {
		if (!types.length) {
			return;
		}
		await this.mutate('types', (current) => current.push(...types));
	}

	public async removeTypes(types: number[]) {
		if (!types.length) {
			return;
		}
		await this.write(
			'types',
			(await this.store).types.filter((type) => !types.includes(type)),
		);
	}

	public async updateStatus(status: number) {
		await this.write('status', status);
	}

	/**
	 * 读取配置中的原始图片记录（未拼接路径、未排序）。
	 *
	 * 仅内部增删逻辑使用，对外统一暴露 `images` 完整路径数组。
	 */
	private async imagesRaw() {
		return (await this.store).images;
	}

	/**
	 * 过滤掉不存在、非图片或不在当前系列目录下的图片名称。
	 */
	private async filterImageNames(imageNames: string[]) {
		const filterImages = [] as string[];
		for (const image of imageNames) {
			if (!image) {
				continue;
			}
			const imagePath = path.join(this.directory, image);
			if (!(await isFileExist(imagePath))) {
				continue;
			}
			const extension = path.extname(imagePath);
			if (!SERVER.allowedImageExtensions.includes(extension)) {
				continue;
			}
			filterImages.push(image);
		}
		return filterImages;
	}

	public async updateSeasonSort(getTarget: () => Season | Promise<Season>, position: number) {
		// 目标季必须在队列内解析，否则并发请求会使用过期位置覆盖前一项的调整结果。
		const task = this.seasonSortQueue.then(async () => this.doUpdateSeasonSort(await getTarget(), position));
		this.seasonSortQueue = task.catch(() => {});
		return await task;
	}

	/**
	 * 按“移动到第 N 位”重排季顺序。
	 *
	 * 不能依赖新旧 sort 值做区间平移：历史数据的 sort 可能存在空洞或重复，
	 * 一旦客户端顺序与 sort 顺序不一致，`oldSort === newSort` 会让请求空转。
	 * 这里改为按当前 sort 推导顺序、移动目标项、再统一重编号，
	 * 并原地重排缓存数组，保证后续接口返回的顺序与落库顺序一致。
	 */
	private async doUpdateSeasonSort(target: Season, position: number) {
		const seasons = await this.seasons;
		if (!seasons.length) {
			return;
		}
		const entries = await Promise.all(seasons.map(async (season) => ({ season, sort: await season.sort })));
		entries.sort((a, b) => a.sort - b.sort);
		const ordered = entries.map((item) => item.season);
		const current = ordered.indexOf(target);
		if (current === -1) {
			return;
		}
		const next = Math.min(Math.max(1, position), ordered.length) - 1;
		if (next === current) {
			return;
		}
		ordered.splice(next, 0, ordered.splice(current, 1)[0]!);
		for (let index = 0; index < ordered.length; index++) {
			await ordered[index]!.rewriteSort(index + 1);
		}
		seasons.splice(0, seasons.length, ...ordered);
	}
	// endregion

	// region 系列数据初始化，包括检测目录，读取配置文件，解析目录信息
	/**
	 * 系列数据初始化，包括检测目录，读取配置文件，解析目录信息
	 */
	private async initialize(resolve: PromiseResolve<SeriesStore>, reject: PromiseReject) {
		// 四个校验都是独立的文件系统调用，并行执行可少掉三次串行等待
		const [dataFileAllowed, directoryExists, directoryIsDirectory, directoryAllowed] = await Promise.all([
			Series.isAllowedDirectory(this.dataFile),
			isFileExist(this.directory),
			isDirectory(this.directory),
			Series.isAllowedDirectory(this.directory),
		]);
		if (!dataFileAllowed) {
			return reject(new Error(`系列数据文件 ${this.dataFile} 不被允许访问`));
		}
		if (!directoryExists) {
			return reject(new Error(`系列目录 ${this.directory} 不存在`));
		}
		if (!directoryIsDirectory) {
			return reject(new Error(`系列目录 ${this.directory} 不是一个文件夹`));
		}
		if (!directoryAllowed) {
			return reject(new Error(`系列目录 ${this.directory} 不被允许访问`));
		}

		await this.getDataInstance()
			.read()
			.then(async (configs) => {
				resolve(await this.resolveSeriesConfig(configs));
			})
			.catch(() => {
				reject(new Error(`数据文件 ${this.dataFile} 数据初始化异常`));
			});
	}

	private async refreshConfig() {
		const configs = await this.getDataInstance().read();
		await this.resolveSeriesConfig(configs);
		this.invalidate();
	}

	private async resolveSeriesConfig(configs: SeriesStore[]) {
		const id = this.hashId;
		const name = path.basename(this.directory);
		const images = [] as SeriesImagesStoreStruct;

		// 图片目录扫描同样复用 Dirent，目录和普通文件无需重复查询文件状态。
		for (const entry of await fs.readdir(this.directory, { withFileTypes: true })) {
			const filePath = path.join(this.directory, entry.name);
			if (entry.isDirectory() || (entry.isSymbolicLink() && (await isDirectory(filePath)))) {
				continue;
			}
			const extension = path.extname(filePath);
			if (!SERVER.allowedImageExtensions.includes(extension)) {
				continue;
			}
			images.push({ path: entry.name, sort: images.length + 1 });
		}

		if (!configs.find((config) => config.id === id)) {
			// 重新写入配置数据，需要通过代理进行绑定
			configs.push({
				id: id,
				path: this.directory,
				name: name,
				title: name,
				images: images,
				date: [],
				types: [],
				status: 0,
				description: '',
				seasons: [],
			} satisfies SeriesStore);
		}

		const config = configs.find((config) => config.id === id)!;

		// 图片重排序
		const oldImages = config.images || [];
		let maxSort = Math.max(0, ...oldImages.map((image) => image.sort));
		for (const image of images) {
			const oldImage = oldImages.find((item) => item.path === image.path);
			image.sort = oldImage ? oldImage.sort : ++maxSort;
		}

		config.id = id;
		config.name = name;
		config.title = config.title || name;
		config.images = images;
		config.date = config.date || [];
		config.types = config.types || [];
		config.status = config.status || 0;
		config.description = config.description || '';
		config.seasons = config.seasons || [];
		return config;
	}
	// endregion
}
