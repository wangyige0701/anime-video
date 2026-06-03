import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Series as ISeries, SeriesImagesStoreStruct, ServerToPromise } from '~types/videos';
import { allowedImageExtensions, DATA_FILE } from '~config/server';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Data } from './data';
import { Common } from './common';
import { Season } from './season';
import { Episode } from './episode';

type SeriesStore = Omit<ISeries, 'images'> & { images: SeriesImagesStoreStruct };

/**
 * Series / Season / Episode 在更新属性时，没有去等待文件写入完成，因为数据记录在内存中完成，写文件是延迟操作，所以为了尽快完成数据更新，文件写入会放到后自动执行
 */
export class Series extends Common implements Omit<ServerToPromise<ISeries>, 'seasons'> {
	/**
	 * 视频系列缓存，key 为视频系列 id，value 为视频系列实例
	 */
	protected static cache: Map<string, Series> = new Map();

	/**
	 * 获取所有视频系列实例
	 */
	public static async getAllSeries() {
		const directories = await this.getDirectories();
		const result: Series[] = [];
		for (const directory of directories) {
			if (!(await isFileExist(directory))) {
				continue;
			}

			const temp = [] as Series[];

			// 遍历配置目录下的文件夹，依次去解析系列数据
			for (const folder of await fs.readdir(directory)) {
				const folderPath = path.join(directory, folder);
				// 非文件夹不进入实例化
				if (!(await isDirectory(folderPath))) {
					continue;
				}

				const series = new Series(directory, folder);
				await series.getPromise();
				temp.push(series);
			}

			// 从原配置数据中移除不存在的系列数据
			// 如果有新增的已经在 resolveSeriesConfig 中添加过了，这里只需要移除不存在的系列数据
			const data = Data.instance<ISeries[]>(path.join(directory, DATA_FILE), []);
			const currentSeries = await data.read();
			const ids = await Promise.all(temp.map((item) => item.id));
			for (let i = currentSeries.length - 1; i >= 0; i--) {
				const series = currentSeries[i];
				if (!ids.find((id) => id === series.id)) {
					currentSeries.splice(i, 1);
				}
			}
			await data.save();

			result.push(...temp);
		}

		return result;
	}

	/**
	 * 刷新所有视频系列信息，移除不存在于配置目录中的视频系列，并更新视频系列信息
	 */
	public static async updateSeries() {
		// 移除不存在于配置目录中的视频系列
		for (const [key, series] of this.cache) {
			const seriesPath = series.getDirectory();
			if (!this.isAllowedDirectory(seriesPath)) {
				this.deleteCache(key);

				// 循环移除系列目录下的其它缓存
				const seasons = await series.seasons;
				for (const season of seasons) {
					Season.deleteCache(await season.id);

					const episodes = await season.episodes;
					for (const episode of episodes) {
						Episode.deleteCache(await episode.id);
					}
				}
			}
		}
		await this.getAllSeries();
	}

	/**
	 * 根据视频系列 id 获取视频系列实例
	 *
	 * @param id 视频系列 id
	 */
	public static async getSeriesById(id: string) {
		if (this.hasCache(id)) {
			// 缓存中存在，直接返回
			return this.getCache(id) as Series;
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			if ((await series.id) === id) {
				return series;
			}
		}
		throw new Error(`没有找到 id 为 ${id} 的视频系列`);
	}

	/**
	 * 根据视频季 id 获取视频季实例
	 *
	 * @param id 视频季 id
	 */
	public static async getSeasonById(id: string) {
		if (Season.hasCache(id)) {
			return Season.getCache(id) as Season;
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			const seasons = await Season.getAllSeasons(series);
			for (const season of seasons) {
				if ((await season.id) === id) {
					return season;
				}
			}
		}
		throw new Error(`没有找到 id 为 ${id} 的视频季`);
	}

	/**
	 * 根据视频集 id 获取视频集实例
	 *
	 * @param id 视频集 id
	 */
	public static async getEpisodeById(id: string) {
		if (Episode.hasCache(id)) {
			return Episode.getCache(id) as Episode;
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			const seasons = await Season.getAllSeasons(series);
			for (const season of seasons) {
				const episodes = await Episode.getAllEpisodes(season);
				for (const episode of episodes) {
					if ((await episode.id) === id) {
						return episode;
					}
				}
			}
		}
		throw new Error(`没有找到 id 为 ${id} 的视频集`);
	}

	private _id!: Promise<string>;
	private _path!: Promise<string>;
	private _name!: Promise<string>;
	private _title!: Promise<string>;
	private _images!: Promise<string[]>;
	private _description!: Promise<string>;
	private _tags!: Promise<string[]>;
	private _seasons!: Promise<Season[]>;

	private directory!: string;
	private dataFile!: string;
	private hashId!: string;
	private promise!: Promise<SeriesStore>;

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
		this.hashId = id;
		this.dataFile = path.resolve(this.directory, '..', DATA_FILE);

		const { resolve, reject, promise } = createPromise<SeriesStore>();
		this.promise = promise;

		// 需要在构造函数中立刻注册
		this.registerId();
		this.registerPath();
		this.registerName();
		this.registerTitle();
		this.registerImages();
		this.registerDescription();
		this.registerTags();
		this.registerSeasons();

		this.initialize(resolve, reject);
	}

	public async json(): Promise<ISeries> {
		return {
			id: await this.id,
			path: await this.path,
			name: await this.name,
			title: await this.title,
			images: await this.images,
			description: await this.description,
			tags: await this.tags,
			seasons: await Promise.all((await this.seasons).map((season) => season.json())),
		};
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

	// get 属性代理
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

	public get tags() {
		return this._tags;
	}

	public get seasons() {
		return this._seasons;
	}

	/**
	 * 获取系列初始化的 promise 示例，可以判断内部是否出现异常
	 */
	public getPromise() {
		return this.promise;
	}

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
			if (!allowedImageExtensions.includes(extension)) {
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
	public async addImages(...imageNames: string[]) {
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
			if (!allowedImageExtensions.includes(extension)) {
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
	public async removeImages(...imageNames: string[]) {
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

	public async updateTags(tags: string[]) {
		const config = await this.promise;
		config.tags = tags;
		this.registerTags();
	}

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

	private registerTags() {
		this._tags = this.promise.then(({ tags }) => tags);
	}

	/**
	 * 系列数据初始化，包括检测目录，读取配置文件，解析目录信息
	 */
	private async initialize(resolve: PromiseResolve<SeriesStore>, reject: PromiseReject) {
		if (!Series.isAllowedDirectory(this.dataFile)) {
			return reject(new Error(`系列数据文件 ${this.dataFile} 不被允许访问`));
		}
		if (!(await isFileExist(this.directory))) {
			return reject(new Error(`系列目录 ${this.directory} 不存在`));
		}
		if (!(await isDirectory(this.directory))) {
			return reject(new Error(`系列目录 ${this.directory} 不是一个文件夹`));
		}
		if (!Series.isAllowedDirectory(this.directory)) {
			return reject(new Error(`系列目录 ${this.directory} 不被允许访问`));
		}

		await this.getDataInstance()
			.read()
			.then((configs) => {
				return this.resolveSeriesConfig(configs, resolve);
			})
			.catch(() => {
				reject(new Error(`数据文件 ${this.dataFile} 数据初始化异常`));
			});
	}

	private async resolveSeriesConfig(configs: SeriesStore[], resolve: PromiseResolve<SeriesStore>) {
		const id = this.hashId;
		const name = path.basename(this.directory);
		const images = [] as SeriesImagesStoreStruct;

		for (const file of await fs.readdir(this.directory)) {
			const filePath = path.join(this.directory, file);
			if (await isDirectory(filePath)) {
				continue;
			}
			const extension = path.extname(filePath);
			if (!allowedImageExtensions.includes(extension)) {
				continue;
			}
			images.push({ path: file, sort: images.length + 1 });
		}

		if (!configs.find((config) => config.id === id)) {
			// 重新写入配置数据，需要通过代理进行绑定
			configs.push({
				id: id,
				path: this.directory,
				name: name,
				title: name,
				images: images,
				tags: [],
				description: '',
				seasons: [],
			} satisfies SeriesStore);
		}

		const config = configs.find((config) => config.id === id)!;

		// 图片重排序
		const oldImages = config.images || [];
		let maxSort = Math.max(...oldImages.map((image) => image.sort));
		for (const image of images) {
			if (!oldImages.find((oldImage) => oldImage.path === image.path)) {
				image.sort = ++maxSort;
			}
		}

		config.id = id;
		config.name = name;
		config.title = config.title || name;
		config.images = images;
		config.tags = config.tags || [];
		config.description = config.description || '';
		config.seasons = config.seasons || [];
		return resolve(config);
	}
}
