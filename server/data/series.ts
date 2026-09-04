import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Series as ISeries, SeriesImagesStoreStruct, ServerToPromise } from '~types/videos';
import { NotFoundError } from '~server/src/error/notFound';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Data } from './data';
import { Common } from './common';
import { Season } from './season';
import { Episode } from './episode';

const SERVER = __APP_CONFIG__.server;
const DATA_FILE = SERVER.videoConfigPrefix + SERVER.dataFile;

type SeriesStore = Omit<ISeries, 'images'> & { images: SeriesImagesStoreStruct };

/**
 * Series / Season / Episode 在更新属性时，没有去等待文件写入完成，因为数据记录在内存中完成，写文件是延迟操作，所以为了尽快完成数据更新，文件写入会放到后自动执行
 */
export class Series extends Common implements Omit<ServerToPromise<ISeries>, 'seasons'> {
	/**
	 * 视频系列缓存，key 为视频系列 id，value 为视频系列实例
	 */
	protected static cache: Map<string, Series> = new Map();
	// 首次扫描完成后，普通读取复用索引；文件系统变化由刷新接口主动对账。
	private static isIndexed = false;

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
			for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
				const entryPath = path.join(directory, entry.name);
				// 符号链接仍回退到 stat，以保持此前可扫描链接目录的兼容行为。
				if (!entry.isDirectory() && !(entry.isSymbolicLink() && (await isDirectory(entryPath)))) {
					continue;
				}

				const series = new Series(directory, entry.name);
				await series.getPromise();
				temp.push(series);
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

	private _id!: Promise<ISeries['id']>;
	private _path!: Promise<ISeries['path']>;
	private _name!: Promise<ISeries['name']>;
	private _title!: Promise<ISeries['title']>;
	private _images!: Promise<ISeries['images']>;
	private _description!: Promise<ISeries['description']>;
	private _date!: Promise<ISeries['date']>;
	private _types!: Promise<ISeries['types']>;
	private _status!: Promise<ISeries['status']>;
	private _seasons!: Promise<Season[]>;

	private seriesName!: string;
	private directory!: string;
	private dataFile!: string;
	private hashId!: string;
	private promise!: Promise<SeriesStore>;
	private seasonSortQueue: Promise<void> = Promise.resolve();

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
		this.promise = promise;
		const fail: PromiseReject = (error) => {
			// 初始化失败的 Promise 不能留在缓存中，否则后续访问会一直复用失败结果。
			Series.cache.delete(id);
			reject(error);
		};

		// 需要在构造函数中立刻注册
		this.register();

		this.initialize(resolve, fail).catch(fail);
	}

	private register() {
		this.registerId();
		this.registerPath();
		this.registerName();
		this.registerTitle();
		this.registerImages();
		this.registerDescription();
		this.registerDate();
		this.registerTypes();
		this.registerStatus();
		this.registerSeasons();
	}

	/**
	 * 获取视频系列信息，包含视频季和视频集信息
	 */
	public async getValue(): Promise<ISeries> {
		const [id, path, name, title, images, description, date, types, status, seasons] = await Promise.all([
			this.id,
			this.path,
			this.name,
			this.title,
			this.images,
			this.description,
			this.date,
			this.types,
			this.status,
			Promise.all((await this.seasons).map((season) => season.getValue())),
		]);
		return {
			id,
			path,
			name,
			title,
			images,
			description,
			date,
			types,
			status,
			seasons,
		};
	}

	/**
	 * 获取视频系列信息，不包含视频季信息
	 */
	public async getValueOmitSeasons(): Promise<Omit<ISeries, 'seasons'>> {
		// 重复处理，避免此处调用 season 的数据获取方法
		const [id, path, name, title, images, description, date, types, status] = await Promise.all([
			this.id,
			this.path,
			this.name,
			this.title,
			this.images,
			this.description,
			this.date,
			this.types,
			this.status,
		]);
		return {
			id,
			path,
			name,
			title,
			images,
			description,
			date,
			types,
			status,
		};
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
		return this.promise;
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
		return this.promise;
	}

	// region 属性代理
	public get id() {
		return this._id;
	}

	public get path() {
		return this._path;
	}

	public get name() {
		return this._name;
	}

	public get title() {
		return this._title;
	}

	public get images() {
		return this._images;
	}

	public get description() {
		return this._description;
	}

	public get date() {
		return this._date;
	}

	public get types() {
		return this._types;
	}

	public get status() {
		return this._status;
	}

	public get seasons() {
		return this._seasons;
	}
	// endregion

	// region 更新数据方法，更新后会自动注册并更新对应的 get 属性代理
	public async updateTitle(title: string) {
		const config = await this.promise;
		config.title = title;
		this.registerTitle();
	}

	public async updateDescription(description: string) {
		const config = await this.promise;
		config.description = description;
		this.registerDescription();
	}

	/**
	 * 更新视频系列图片，可以用来更新排序
	 *
	 * @param imageNames 图片名称数组，仅更新位于当前系列目录下的图片，不要传绝对路径
	 */
	public async updateImages(imageNames: string[]) {
		const config = await this.promise;
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
		if (!filterImages.length) {
			return;
		}
		config.images = filterImages.map((image, index) => {
			return { path: path.basename(image), sort: index + 1 } satisfies SeriesImagesStoreStruct[number];
		});
		this.registerImages();
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
		const config = await this.promise;
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
		if (!filterImages.length) {
			return;
		}
		const maxSort = Math.max(1, ...config.images.map((image) => image.sort));
		config.images.push(
			...filterImages.map((image, index) => {
				return {
					path: path.basename(image),
					sort: maxSort + index + 1,
				} satisfies SeriesImagesStoreStruct[number];
			}),
		);
		this.registerImages();
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
		const config = await this.promise;
		const oldImages = config.images;
		const filterImages = imageNames.filter((image) => image).map((image) => path.basename(image));
		const newImages = [] as SeriesImagesStoreStruct;
		for (const image of oldImages) {
			if (!filterImages.find((img) => img === image.path)) {
				newImages.push({ path: image.path, sort: newImages.length + 1 });
			}
		}
		if (oldImages.length !== newImages.length) {
			config.images = newImages;
			this.registerImages();
		}
	}

	public async updateDate(year: number, month: number) {
		const config = await this.promise;
		config.date = [year, month];
		this.registerDate();
	}

	public async removeDate() {
		const config = await this.promise;
		config.date = [];
		this.registerDate();
	}

	public async updateTypes(types: number[]) {
		const config = await this.promise;
		config.types = types;
		this.registerTypes();
	}

	public async addTypes(types: number[]) {
		if (!types.length) {
			return;
		}
		const config = await this.promise;
		config.types.push(...types);
		this.registerTypes();
	}

	public async removeTypes(types: number[]) {
		if (!types.length) {
			return;
		}
		const config = await this.promise;
		config.types = config.types.filter((type) => !types.includes(type));
		this.registerTypes();
	}

	public async updateStatus(status: number) {
		const config = await this.promise;
		config.status = status;
		this.registerStatus();
	}

	public async updateSeasonSort(getOldSort: () => Promise<number>, newSort: number) {
		// 旧排序值必须在队列内读取，否则并发请求会使用过期位置覆盖前一项的调整结果。
		const task = this.seasonSortQueue.then(async () => this.doUpdateSeasonSort(await getOldSort(), newSort));
		this.seasonSortQueue = task.catch(() => {});
		return await task;
	}

	private async doUpdateSeasonSort(oldSort: number, newSort: number) {
		if (oldSort === newSort) {
			return;
		}
		const seasons = await this.seasons;
		if (newSort < 1) {
			newSort = 1;
		}
		if (newSort > seasons.length) {
			newSort = seasons.length;
		}
		for (const season of seasons) {
			const sort = await season.sort;
			const minSort = Math.min(oldSort, newSort);
			const maxSort = Math.max(oldSort, newSort);
			if (sort < minSort) {
				continue;
			}
			if (sort > maxSort) {
				break;
			}
			if (sort === oldSort) {
				await season.rewriteSort(newSort);
				continue;
			}
			if (oldSort < newSort) {
				// 其余项需要减一
				await season.rewriteSort(sort - 1);
			} else {
				// 其余项需要加一
				await season.rewriteSort(sort + 1);
			}
		}
	}
	// endregion

	// region 注册数据方法，注册后会更新对应的 get 属性代理
	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerPath() {
		this._path = this.promise.then(({ path }) => path);
	}

	private registerName() {
		this._name = this.promise.then(({ name }) => name);
	}

	private registerTitle() {
		this._title = this.promise.then(({ title }) => title);
	}

	private registerImages() {
		// 需要处理图片排序和路径拼接
		this._images = this.promise.then(({ images }) =>
			images.sort((a, b) => a.sort - b.sort).map((image) => path.join(this.directory, image.path)),
		);
	}

	private registerSeasons() {
		this._seasons = this.promise.then(() => Season.getAllSeasons(this));
	}

	private registerDescription() {
		this._description = this.promise.then(({ description }) => description);
	}

	private registerDate() {
		this._date = this.promise.then(({ date }) => date);
	}

	private registerTypes() {
		this._types = this.promise.then(({ types }) => types);
	}

	private registerStatus() {
		this._status = this.promise.then(({ status }) => status);
	}
	// endregion

	// region 系列数据初始化，包括检测目录，读取配置文件，解析目录信息
	/**
	 * 系列数据初始化，包括检测目录，读取配置文件，解析目录信息
	 */
	private async initialize(resolve: PromiseResolve<SeriesStore>, reject: PromiseReject) {
		if (!(await Series.isAllowedDirectory(this.dataFile))) {
			return reject(new Error(`系列数据文件 ${this.dataFile} 不被允许访问`));
		}
		if (!(await isFileExist(this.directory))) {
			return reject(new Error(`系列目录 ${this.directory} 不存在`));
		}
		if (!(await isDirectory(this.directory))) {
			return reject(new Error(`系列目录 ${this.directory} 不是一个文件夹`));
		}
		if (!(await Series.isAllowedDirectory(this.directory))) {
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
		this.register();
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
