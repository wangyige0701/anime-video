import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Series as ISeries, ServerToPromise } from '~types/videos';
import { DATA_FILE } from '~config/server';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Data } from './data';
import { Common } from './common';
import { Season } from './season';
import { Episode } from './episode';

export class Series extends Common implements Omit<ServerToPromise<ISeries>, 'seasons'> {
	/**
	 * 视频系列缓存，key 为视频系列 id，value 为视频系列实例
	 */
	private static cache: Map<string, Series> = new Map();

	public static clearCache() {
		this.cache.clear();
	}

	public static deleteCache(id: string) {
		if (this.cache.has(id)) {
			this.cache.delete(id);
		}
	}

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
				const series = new Series(directory, folder);
				await series.getPromise();
				temp.push(series);
			}

			// 从原配置数据中移除不存在的系列数据
			// 如果有新增的已经在 resolveSeriesConfig 中添加过了，这里只需要移除不存在的系列数据
			const currentSeries = await Data.instance<ISeries[]>(path.join(directory, DATA_FILE), []).read();
			const ids = await Promise.all(temp.map((item) => item.id));
			for (let i = currentSeries.length - 1; i >= 0; i--) {
				const series = currentSeries[i];
				if (!ids.find((id) => id === series.id)) {
					currentSeries.splice(i, 1);
				}
			}

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
		if (this.cache.has(id)) {
			// 缓存中存在，直接返回
			return this.cache.get(id)!;
		}
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			if ((await series.id) === id) {
				return series;
			}
		}
		throw new Error(`没有找到 id 为 ${id} 的视频系列`);
	}

	public static async getSeasonById(id: string) {
		const allSeries = await this.getAllSeries();
	}

	private _id!: Promise<string>;
	private _rootPath!: Promise<string>;
	private _name!: Promise<string>;
	private _title!: Promise<string>;
	private _images!: Promise<string[]>;
	private _description!: Promise<string>;
	private _tags!: Promise<string[]>;
	private _seasons!: Promise<Season[]>;

	private directory!: string;
	private dataFile!: string;
	private hashId!: string;
	private promise!: Promise<ISeries>;

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

		const { resolve, reject, promise } = createPromise<ISeries>();
		this.promise = promise;

		// 需要在构造函数中立刻注册
		this.registerId();
		this.registerRootPath();
		this.registerName();
		this.registerTitle();
		this.registerImages();
		this.registerDescription();
		this.registerTags();
		this.registerSeasons();

		this.initialize(resolve, reject);
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

	// get 属性代理
	public get id() {
		return this._id;
	}

	public get rootPath() {
		return this._rootPath;
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

	public async updateImages(images: string[]) {
		const config = await this.promise;
		config.images = images;
		this.registerImages();
	}

	public async updateTags(tags: string[]) {
		const config = await this.promise;
		config.tags = tags;
		this.registerTags();
	}

	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerRootPath() {
		this._rootPath = this.promise.then(({ rootPath }) => rootPath);
	}

	private registerName() {
		this._name = this.promise.then(({ name }) => name);
	}

	private registerTitle() {
		this._title = this.promise.then(({ title }) => title);
	}

	private registerImages() {
		this._images = this.promise.then(({ images }) => images);
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
	private async initialize(resolve: PromiseResolve<ISeries>, reject: PromiseReject) {
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

		await Data.instance<ISeries[]>(this.dataFile, [])
			.read()
			.then((configs) => {
				return this.resolveSeriesConfig(configs, resolve);
			})
			.catch(() => {
				reject(new Error(`数据文件 ${this.dataFile} 数据初始化异常`));
			});
	}

	private resolveSeriesConfig(configs: ISeries[], resolve: PromiseResolve<ISeries>) {
		const id = this.hashId;
		const name = path.basename(this.directory);
		if (!configs.find((config) => config.id === id)) {
			// 重新写入配置数据，需要通过代理进行绑定
			configs.push({
				id: id,
				rootPath: this.directory,
				name: name,
				title: name,
				images: [],
				tags: [],
				description: '',
				seasons: [],
			} satisfies ISeries);
		}
		const config = configs.find((config) => config.rootPath === this.directory)!;
		config.id = id;
		config.name = name;
		config.title = config.title || name;
		config.images = config.images || [];
		config.tags = config.tags || [];
		config.description = config.description || '';
		config.seasons = config.seasons || [];
		return resolve(config);
	}
}
