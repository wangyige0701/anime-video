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
		// 普通目录项由 readdir 直接判别类型，符号链接才需要额外 stat 以兼容旧行为。
		for (const entry of await fs.readdir(series.getDirectory(), { withFileTypes: true })) {
			const entryPath = path.join(series.getDirectory(), entry.name);
			if (!entry.isDirectory() && !(entry.isSymbolicLink() && (await isDirectory(entryPath)))) {
				continue;
			}
			const season = new Season(entry.name, series);
			await season.getPromise();
			season.register();
			result.push({ season, sort: await season.sort });
		}

		result.sort((a, b) => a.sort - b.sort);

		// 移除不存在的季实例
		const ids = new Set(await Promise.all(result.map((item) => item.season.id)));
		const seasons = (await series.getConfig()).seasons; // 配置文件中读取的季数据
		for (let i = seasons.length - 1; i >= 0; i--) {
			const season = seasons[i];
			if (!ids.has(season.id)) {
				seasons.splice(i, 1);
			}
		}
		await series.getDataInstance().save();
		// 刷新后回收已删除目录的季及其剧集缓存。
		for (const [id, cached] of this.cache) {
			if (cached.getSeries() === series && !ids.has(id)) {
				await this.deleteCache(id);
			}
		}

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
	private episodeSortQueue: Promise<void> = Promise.resolve();

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
		const fail: PromiseReject = (error) => {
			// 避免构造失败的季占据同一 ID 的缓存位置。
			Season.cache.delete(id);
			reject(error);
		};

		this.register();

		this.initialize(resolve, fail).catch(fail);
	}

	private register() {
		this.registerId();
		this.registerSort();
		this.registerPath();
		this.registerTitle();
		this.registerEpisodes();
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
		await this.series.updateSeasonSort(() => this, Math.max(1, sort));
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

	public async updateEpisodeSort(getTarget: () => Episode | Promise<Episode>, position: number) {
		// 目标集必须在队列内解析，保证并发调整按队列中的最新状态计算。
		const task = this.episodeSortQueue.then(async () => this.doUpdateEpisodeSort(await getTarget(), position));
		this.episodeSortQueue = task.catch(() => {});
		return await task;
	}

	/**
	 * 按“移动到第 N 位”重排剧集顺序。
	 *
	 * 与季排序同理：不依赖新旧 sort 做区间平移，而是按当前 sort 推导顺序、
	 * 移动目标集后统一重编号，并原地重排缓存数组，避免接口返回的顺序滞后于落库结果。
	 */
	private async doUpdateEpisodeSort(target: Episode, position: number) {
		const episodes = await this.episodes;
		if (!episodes.length) {
			return;
		}
		const entries = await Promise.all(episodes.map(async (episode) => ({ episode, sort: await episode.sort })));
		entries.sort((a, b) => a.sort - b.sort);
		const ordered = entries.map((item) => item.episode);
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
		episodes.splice(0, episodes.length, ...ordered);
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
		if (!(await Season.isAllowedDirectory(this.directory))) {
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
