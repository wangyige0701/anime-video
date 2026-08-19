import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Episode as IEpisode, ServerToPromise } from '~types/videos';
import { allowedVideoExtensions } from '~config/server';
import type { Season } from './season';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Common } from './common';

export class Episode extends Common implements ServerToPromise<IEpisode> {
	protected static cache: Map<string, Episode> = new Map();

	public static async clearCache() {
		this.cache.clear();
	}

	public static async deleteCache(id: string) {
		if (!this.cache.has(id)) {
			return;
		}
		this.cache.delete(id);
	}

	public static async getAllEpisodes(season: Season) {
		const result = [] as Array<{ episode: Episode; sort: number }>;
		for (const entry of await fs.readdir(season.getDirectory(), { withFileTypes: true })) {
			const extension = path.extname(entry.name).toLowerCase();
			// 只有普通文件且扩展名在服务端白名单中时，才会作为可播放剧集登记。
			if (!entry.isFile() || !allowedVideoExtensions.includes(extension)) {
				continue;
			}
			const episode = new Episode(entry.name, season);
			await episode.getPromise();
			episode.register();
			result.push({ episode, sort: await episode.sort });
		}
		result.sort((a, b) => a.sort - b.sort);

		// 移除不存在的视频实例
		const ids = new Set(await Promise.all(result.map((item) => item.episode.id)));
		const episodes = (await season.getConfig()).episodes || [];
		for (let i = episodes.length - 1; i >= 0; i--) {
			const episode = episodes[i];
			if (!ids.has(episode.id)) {
				episodes.splice(i, 1);
			}
		}
		await season.getSeries().getDataInstance().save();
		// 删除文件后同步回收对应的内存实例，避免旧 ID 命中已失效缓存。
		for (const [id, cached] of this.cache) {
			if (cached.getSeason() === season && !ids.has(id)) {
				await this.deleteCache(id);
			}
		}

		return result.map((item) => item.episode) as Episode[];
	}

	private _id!: Promise<IEpisode['id']>;
	private _sort!: Promise<IEpisode['sort']>;
	private _path!: Promise<IEpisode['path']>;
	private _extension!: Promise<IEpisode['extension']>;
	private _title!: Promise<IEpisode['title']>;

	private episodeName!: string;
	private directory!: string;
	private hashId!: string;
	private promise!: Promise<IEpisode>;

	constructor(
		episodeName: string,
		private season: Season,
	) {
		const directory = path.join(season.getDirectory(), episodeName);
		const id = Episode.hash(directory);
		if (Episode.cache.has(id)) {
			return Episode.cache.get(id)!;
		}

		super();

		Episode.cache.set(id, this);

		this.episodeName = episodeName;
		this.directory = directory;
		this.hashId = id;

		const { resolve, reject, promise } = createPromise<IEpisode>();
		this.promise = promise;
		const fail: PromiseReject = (error) => {
			// 失败实例不保留在缓存中，后续修复文件后可正常重新初始化。
			Episode.cache.delete(id);
			reject(error);
		};

		this.register();

		this.initialize(resolve, fail).catch(fail);
	}

	private register() {
		this.registerId();
		this.registerSort();
		this.registerPath();
		this.registerExtension();
		this.registerTitle();
	}

	/**
	 * 获取视频集信息
	 */
	public async getValue(): Promise<IEpisode> {
		const [id, sort, path, extension, title] = await Promise.all([
			this.id,
			this.sort,
			this.path,
			this.extension,
			this.title,
		]);
		return {
			id,
			sort,
			path,
			extension,
			title,
		};
	}

	public toJSON() {
		const seriesName = this.getSeason().getSeries().getSeriesName();
		const seasonName = this.getSeason().getSeasonName();
		return `[episode ${seriesName} / ${seasonName} / ${this.episodeName}]`;
	}

	public getEpisodeName() {
		return this.episodeName;
	}

	public getSeason() {
		return this.season;
	}

	public async waitDataSave() {
		return await this.getSeason().waitDataSave();
	}

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

	public get extension() {
		return this._extension;
	}

	public get title() {
		return this._title;
	}
	// endregion

	// region 更新集数据
	public async updateSort(sort: number) {
		await this.promise;
		await this.season.updateEpisodeSort(() => this.sort, Math.max(1, sort));
		this.registerSort();
	}

	/**
	 * 更新排序时，由 Season 调用，重新注册排序属性
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
	// endregion

	// region 注册数据方法
	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerSort() {
		this._sort = this.promise.then(({ sort }) => sort);
	}

	private registerPath() {
		this._path = this.promise.then(({ path: fileName }) => path.join(this.season.getDirectory(), fileName));
	}

	private registerExtension() {
		this._extension = this.promise.then(({ extension }) => extension);
	}

	private registerTitle() {
		this._title = this.promise.then(({ title }) => title);
	}
	// endregion

	private async initialize(resolve: PromiseResolve<IEpisode>, reject: PromiseReject) {
		if (!(await isFileExist(this.directory))) {
			return reject(new Error(`集文件 ${this.directory} 不存在`));
		}
		if (await isDirectory(this.directory)) {
			return reject(new Error(`集文件 ${this.directory} 不是一个文件`));
		}
		if (!(await Episode.isAllowedDirectory(this.directory))) {
			return reject(new Error(`集文件 ${this.directory} 不被允许访问`));
		}

		// 获取配置文件数据中的集数组数据
		const configs = (await this.season.getConfig()).episodes;

		this.resolveEpisodeConfig(configs, resolve);
	}

	private resolveEpisodeConfig(configs: IEpisode[], resolve: PromiseResolve<IEpisode>) {
		const id = this.hashId;
		const sort = Math.max(0, ...configs.map((item) => item.sort)) + 1;
		const extension = path.extname(this.directory);
		const fileName = path.basename(this.directory, extension);
		const baseName = path.basename(this.directory);
		if (!configs.find((config) => config.id === id)) {
			configs.push({
				id: id,
				sort: sort,
				path: baseName,
				extension: extension,
				title: fileName,
			});
		}
		const config = configs.find((config) => config.id === id)!;
		config.id = id;
		config.sort = config.sort || sort;
		config.path = baseName;
		config.extension = extension;
		config.title = config.title || fileName;
		resolve(config);
	}
}
