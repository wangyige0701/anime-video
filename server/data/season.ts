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

	public static async clearCache() {
		for (const [_key, season] of this.cache) {
			const episodes = await season.episodes;
			for (const episode of episodes) {
				await Episode.clearCache();
			}
		}
		this.cache.clear();
	}

	public static async deleteCache(id: string) {
		if (!this.cache.has(id)) {
			return;
		}
		const season = this.cache.get(id)!;
		// 循环移除季目录下的其它缓存
		const episodes = await season.episodes;
		for (const episode of episodes) {
			await Episode.deleteCache(await episode.id);
		}
		this.cache.delete(id);
	}

	/**
	 * 获取所有视频实例
	 * @param series 视频系列实例
	 */
	public static async getAllSeasons(series: Series) {
		const result = [] as Array<{ season: Season; sort: number }>;
		for (const file of await fs.readdir(series.getDirectory())) {
			const filePath = path.join(series.getDirectory(), file);
			if (!(await isDirectory(filePath))) {
				continue;
			}
			const season = new Season(file, series);
			await season.getPromise();
			result.push({ season, sort: await season.sort });
		}

		result.sort((a, b) => a.sort - b.sort);

		// 移除不存在的季实例
		const ids = await Promise.all(result.map((item) => item.season.id));
		const seasons = (await series.getConfig()).seasons; // 配置文件中读取的季数据
		for (let i = seasons.length - 1; i >= 0; i--) {
			const season = seasons[i];
			if (!ids.find((id) => id === season.id)) {
				seasons.splice(i, 1);
			}
		}
		await series.getDataInstance().save();

		return result.map((item) => item.season) as Season[];
	}

	private _id!: Promise<ISeason['id']>;
	private _sort!: Promise<ISeason['sort']>;
	private _path!: Promise<ISeason['path']>;
	private _title!: Promise<ISeason['title']>;
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
		this.registerSort();
		this.registerPath();
		this.registerTitle();
		this.registerEpisodes();

		this.initialize(resolve, reject);
	}

	/**
	 * 获取视频季信息，包含视频集信息
	 */
	public async getValue(): Promise<ISeason> {
		const [id, sort, path, title, episodes] = await Promise.all([
			this.id,
			this.sort,
			this.path,
			this.title,
			Promise.all((await this.episodes).map((episode) => episode.getValue())),
		]);
		return {
			id,
			sort,
			path,
			title,
			episodes,
		};
	}

	public async getValueOmitEpisodes() {
		const [id, sort, path, title] = await Promise.all([this.id, this.sort, this.path, this.title]);
		return {
			id,
			sort,
			path,
			title,
		};
	}

	public toJSON() {
		const seriesName = this.getSeries().getSeriesName();
		return `[season ${seriesName} / ${this.seasonName}]`;
	}

	public getSeasonName() {
		return this.seasonName;
	}

	public getSeries() {
		return this.series;
	}

	public async waitDataSave() {
		return await this.getSeries().waitDataSave();
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

	// region 属性代理
	public get id() {
		return this._id;
	}

	public get sort() {
		return this._sort;
	}

	public get path() {
		return this._path;
	}

	public get title() {
		return this._title;
	}

	public get episodes() {
		return this._episodes;
	}
	// endregion

	// region 更新季数据
	/**
	 * 更新排序，通过调用 Series 中的方法将所有季的排序更新为新的排序
	 */
	public async updateSort(sort: number) {
		await this.promise;
		await this.series.updateSeasonSort(await this.sort, Math.max(1, sort));
	}

	/**
	 * 更新排序时，由 Series 调用，重新注册排序属性
	 */
	public async rewriteSort(sort: number) {
		(await this.getConfig()).sort = sort;
		this.registerSort();
	}

	public async updateTitle(title: string) {
		const config = await this.promise;
		config.title = title;
		this.registerTitle();
	}

	public async updateEpisodeSort(oldSort: number, newSort: number) {
		if (oldSort === newSort) {
			return;
		}
		const episodes = await this.episodes;
		if (newSort < 1) {
			newSort = 1;
		}
		if (newSort > episodes.length) {
			newSort = episodes.length;
		}
		for (const episode of episodes) {
			const sort = await episode.sort;
			const minSort = Math.min(oldSort, newSort);
			const maxSort = Math.max(oldSort, newSort);
			if (sort < minSort) {
				continue;
			}
			if (sort > maxSort) {
				break;
			}
			if (sort === oldSort) {
				await episode.rewriteSort(newSort);
				continue;
			}
			if (oldSort < newSort) {
				// 其余项需要减一
				await episode.rewriteSort(sort - 1);
			} else {
				// 其余项需要加一
				await episode.rewriteSort(sort + 1);
			}
		}
	}
	// endregion

	// region 注册数据方法
	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerSort() {
		this._sort = this.promise.then(({ sort }) => sort);
	}

	private registerPath() {
		this._path = this.promise.then(({ path: folderName }) => path.resolve(this.series.getDirectory(), folderName));
	}

	private registerTitle() {
		this._title = this.promise.then(({ title }) => title);
	}

	private registerEpisodes() {
		this._episodes = this.promise.then(() => Episode.getAllEpisodes(this));
	}
	// endregion

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
		const sort = Math.max(0, ...configs.map((item) => item.sort)) + 1;
		if (!configs.find((config) => config.id === id)) {
			configs.push({
				id: id,
				sort: sort,
				path: this.seasonName,
				title: this.seasonName,
				episodes: [],
			} satisfies ISeason);
		}
		const config = configs.find((item) => item.id === id)!;
		config.id = id;
		config.sort = config.sort || sort;
		config.path = this.seasonName;
		config.title = config.title || this.seasonName;
		config.episodes = config.episodes || [];
		resolve(config);
	}
}
