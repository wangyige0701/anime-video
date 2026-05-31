import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Season as ISeason, ServerToPromise } from '~types/videos';
import type { Series } from './series';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Episode } from './episode';
import { Common } from './common';

export class Season extends Common implements Omit<ServerToPromise<ISeason>, 'episodes'> {
	protected static cache: Map<string, Season> = new Map();

	/**
	 * 获取所有视频实例
	 * @param series 视频系列实例
	 */
	public static async getAllSeasons(series: Series) {
		const result = [] as Array<{ season: Season; seasonNumber: number }>;
		for (const file of await fs.readdir(series.getDirectory())) {
			const filePath = path.join(series.getDirectory(), file);
			if (!(await isDirectory(filePath))) {
				continue;
			}
			const season = new Season(file, series);
			await season.getPromise();
			result.push({ season, seasonNumber: await season.seasonNumber });
		}

		result.sort((a, b) => a.seasonNumber - b.seasonNumber);

		// 移除不存在的季实例
		const ids = await Promise.all(result.map((item) => item.season.id));
		const seasons = (await series.getConfig()).seasons; // 配置文件中读取的季数据
		for (let i = seasons.length - 1; i >= 0; i--) {
			const season = seasons[i];
			if (!ids.find((id) => id === season.id)) {
				seasons.splice(i, 1);
			}
		}

		return result.map((item) => item.season) as Season[];
	}

	private _id!: Promise<string>;
	private _seasonNumber!: Promise<number>;
	private _pathName!: Promise<string>;
	private _title!: Promise<string>;
	private _episodes!: Promise<Episode[]>;

	private seasonName!: string;
	private directory!: string;
	private hashId!: string;
	private promise!: Promise<ISeason>;

	/**
	 * @param seasonDirectory 季目录名
	 * @param seasons 当前系列下的所有季数据，用来进行过滤判断
	 * @returns
	 */
	constructor(
		seasonName: string,
		private series: Series,
	) {
		const directory = path.join(series.getDirectory(), seasonName);
		const id = Season.hash(directory);
		if (Season.cache.has(id)) {
			return Season.cache.get(id)!;
		}

		super();

		Season.cache.set(id, this);

		this.seasonName = seasonName;
		this.directory = directory;
		this.hashId = id;

		const { resolve, reject, promise } = createPromise<ISeason>();
		this.promise = promise;

		this.registerId();
		this.registerSeasonNumber();
		this.registerPathName();
		this.registerTitle();
		this.registerEpisodes();

		this.initialize(resolve, reject);
	}

	public getSeries() {
		return this.series;
	}

	/**
	 * 获取季目录绝对路径
	 */
	public getDirectory() {
		return this.directory;
	}

	public getConfig() {
		return this.promise;
	}

	public getPromise() {
		return this.promise;
	}

	public get id() {
		return this._id;
	}

	public get seasonNumber() {
		return this._seasonNumber;
	}

	public get pathName() {
		return this._pathName;
	}

	public get title() {
		return this._title;
	}

	public get episodes() {
		return this._episodes;
	}

	public async updateSeasonNumber(seasonNumber: number) {
		const config = await this.promise;
		config.seasonNumber = Math.max(1, seasonNumber);
		this.registerSeasonNumber();
	}

	public async updateTitle(title: string) {
		const config = await this.promise;
		config.title = title;
		this.registerTitle();
	}

	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerSeasonNumber() {
		this._seasonNumber = this.promise.then(({ seasonNumber }) => seasonNumber);
	}

	private registerPathName() {
		this._pathName = this.promise.then(({ pathName }) => pathName);
	}

	private registerTitle() {
		this._title = this.promise.then(({ title }) => title);
	}

	private registerEpisodes() {
		this._episodes = this.promise.then(() => Episode.getAllEpisodes(this));
	}

	private async initialize(resolve: PromiseResolve<ISeason>, reject: PromiseReject) {
		if (!(await isFileExist(this.directory))) {
			return reject(new Error(`季目录 ${this.directory} 不存在`));
		}
		if (!(await isDirectory(this.directory))) {
			return reject(new Error(`季目录 ${this.directory} 不是一个文件夹`));
		}
		if (!Season.isAllowedDirectory(this.directory)) {
			return reject(new Error(`季目录 ${this.directory} 不被允许访问`));
		}

		// 配置文件中的季数组数据
		const configs = (await this.series.getConfig()).seasons;

		this.resolveSeasonConfig(configs, resolve);
	}

	private resolveSeasonConfig(configs: ISeason[], resolve: PromiseResolve<ISeason>) {
		const id = this.hashId;
		// 排序要从 1 开始
		const seasonNumber = Math.max(1, ...configs.map((item) => item.seasonNumber)) + 1;
		if (!configs.find((config) => config.id === id)) {
			configs.push({
				id: id,
				seasonNumber: seasonNumber,
				pathName: this.seasonName,
				title: this.seasonName,
				episodes: [],
			} satisfies ISeason);
		}
		const config = configs.find((item) => item.id === id)!;
		config.id = id;
		config.seasonNumber = config.seasonNumber || seasonNumber;
		config.pathName = config.pathName;
		config.title = config.title || this.seasonName;
		config.episodes = config.episodes || [];
		resolve(config);
	}
}
