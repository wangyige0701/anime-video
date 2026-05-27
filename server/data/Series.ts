import path from 'node:path';
import fs from 'node:fs/promises';
import { Singleton } from 'koa-use-decorator-router';
import type { Series as ISeries, Season as ISeason, ServerToPromise } from '~types/videos';
import { Season } from './Season';
import { DATA_FILE } from '@config/server';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import { ConfigFile } from './ConfigFile';
import { hash } from '@server/src/utils';

@Singleton()
export class Series implements Omit<ServerToPromise<ISeries>, 'seasons'> {
	/**
	 * 视频系列缓存，key 为目录绝对路径，value 为视频系列实例
	 */
	private static cache: Map<string, Series> = new Map();

	/**
	 * 获取所有视频系列目录
	 */
	public static async getDirectories() {
		return await ConfigFile.instance<string[]>(path.resolve(process.cwd(), DATA_FILE), []).read();
	}

	/**
	 * 获取所有视频系列实例
	 */
	public static async getAllSeries() {
		const directories = await this.getDirectories();
		const result: Series[] = [];
		for (const directory of directories) {
			try {
				// 遍历配置目录下的文件夹，依次去解析系列数据
				await fs.access(directory);
				for (const folder of await fs.readdir(directory)) {
					const seriesDirectory = path.resolve(directory, folder);
					result.push(await this.getSeriesByDirectory(seriesDirectory));
				}
			} catch (error) {}
		}
		return result;
	}

	/**
	 * 根据目录绝对路径获取视频系列实例
	 *
	 * @param directory 视频系列目录，即某个视频系列对应的文件夹
	 */
	public static async getSeriesByDirectory(directory: string) {
		if (!this.cache.has(directory)) {
			this.cache.set(directory, new Series(directory));
		}
		return this.cache.get(directory)!;
	}

	/**
	 * 根据视频系列 id 获取视频系列实例
	 *
	 * @param id 视频系列 id
	 */
	public static async getSeriesById(id: string) {
		const allSeries = await this.getAllSeries();
		for (const series of allSeries) {
			if ((await series.id) === id) {
				return series;
			}
		}
		throw new Error(`没有找到 id 为 ${id} 的视频系列`);
	}

	/**
	 * 检查目录是否被允许，所有视频、图片资源文件目录必须在允许的目录中
	 *
	 * @param directory 视频系列目录
	 */
	public static async isAllowedDirectory(directory: string) {
		const directories = await this.getDirectories();
		const handleDirectory = path.resolve(directory);
		return directories.find((item) => {
			return handleDirectory.startsWith(item);
		});
	}

	id!: Promise<string>;
	rootPath!: Promise<string>;
	name!: Promise<string>;
	title!: Promise<string>;
	images!: Promise<string[]>;
	seasons!: Promise<Season[]>;
	description!: Promise<string>;
	tags!: Promise<string[]>;

	private directory: string;
	private configDirectory: string;
	private promise: Promise<ISeries>;

	/**
	 * 构造函数
	 *
	 * @param seriesDirectory 视频系列目录
	 */
	constructor(seriesDirectory: string) {
		this.directory = path.resolve(seriesDirectory);
		this.configDirectory = path.resolve(this.directory, '..', DATA_FILE);
		if (!Series.isAllowedDirectory(this.configDirectory)) {
			throw new Error(`系列配置目录 ${this.configDirectory} 不被允许`);
		}

		const { resolve, promise } = createPromise<ISeries>();
		this.promise = promise;

		this.initial(resolve);
	}

	private async initial(resolve: PromiseResolve<ISeries>) {
		try {
			await fs.access(this.directory);
		} catch (error) {
			throw new Error(`系列目录 ${this.directory} 不存在`);
		}
		if ((await fs.stat(this.directory)).isFile()) {
			throw new Error(`系列目录 ${this.directory} 不是一个文件夹`);
		}

		this.registerId();
		this.registerRootPath();
		this.registerName();
		this.registerTitle();
		this.registerImages();
		this.registerSeasons();
		this.registerDescription();
		this.registerTags();

		ConfigFile.instance<ISeries[]>(this.configDirectory, [])
			.read()
			.then((configs) => {
				return this.readSeries(configs, resolve);
			})
			.catch(() => {
				throw new Error(`目录 ${this.configDirectory} 数据初始化异常`);
			});
	}

	private async readSeries(configs: ISeries[], resolve: PromiseResolve<ISeries>) {
		const id = hash(this.directory);
		const name = path.basename(this.directory);
		const config = configs.find((config) => config.rootPath === this.directory);
		if (!config) {
			return resolve({
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
		config.id = id;
		config.name = name;
		config.title = config.title || name;
		config.images = config.images || [];
		config.tags = config.tags || [];
		config.description = config.description || '';
		config.seasons = config.seasons || [];
		return resolve(config);
	}

	public async updateTitle(title: string) {
		await this.title;
		this.title = Promise.resolve(title);
	}

	public async updateDescription(description: string) {
		await this.description;
		this.description = Promise.resolve(description);
	}

	public async updateImages(images: string[]) {
		await this.images;
		this.images = Promise.resolve(images);
	}

	public async updateTags(tags: string[]) {
		await this.tags;
		this.tags = Promise.resolve(tags);
	}

	private registerId() {
		this.id = this.promise.then(
			({ id }) => id,
			() => '',
		);
	}

	private registerRootPath() {
		this.rootPath = this.promise.then(
			({ rootPath }) => rootPath,
			() => '',
		);
	}

	private registerName() {
		this.name = this.promise.then(
			({ name }) => name,
			() => '',
		);
	}

	private registerTitle() {
		this.title = this.promise.then(
			({ title }) => title,
			() => '',
		);
	}

	private registerImages() {
		this.images = this.promise.then(
			({ images }) => images,
			() => [],
		);
	}

	private registerSeasons() {
		this.seasons = this.promise.then(
			({ seasons }) => seasons.map((season: ISeason) => new Season(season)),
			() => [] as Season[],
		);
	}

	private registerDescription() {
		this.description = this.promise.then(
			({ description }) => description,
			() => '',
		);
	}

	private registerTags() {
		this.tags = this.promise.then(
			({ tags }) => tags,
			() => [],
		);
	}
}
