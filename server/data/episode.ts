import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Episode as IEpisode, ServerToPromise } from '~types/videos';
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
		for (const file of await fs.readdir(season.getDirectory())) {
			const filePath = path.join(season.getDirectory(), file);
			if (await isDirectory(filePath)) {
				continue;
			}
			const episode = new Episode(file, season);
			await episode.getPromise();
			result.push({ episode, sort: await episode.sort });

			result.sort((a, b) => a.sort - b.sort);
		}

		// 移除不存在的视频实例
		const ids = await Promise.all(result.map((item) => item.episode.id));
		const episodes = (await season.getConfig()).episodes || [];
		for (let i = episodes.length - 1; i >= 0; i--) {
			const episode = episodes[i];
			if (!ids.find((id) => id === episode.id)) {
				episodes.splice(i, 1);
			}
		}
		await season.getSeries().getDataInstance().save();

		return result.map((item) => item.episode) as Episode[];
	}

	private _id!: Promise<string>;
	private _sort!: Promise<number>;
	private _path!: Promise<string>;
	private _extension!: Promise<string>;
	private _title!: Promise<string>;

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

		this.registerId();
		this.registerSort();
		this.registerPath();
		this.registerExtension();
		this.registerTitle();

		this.initialize(resolve, reject);
	}

	public async json(): Promise<IEpisode> {
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

	public async updateSort(sort: number) {
		const config = await this.promise;
		config.sort = Math.max(1, sort);
		this.registerSort();
	}

	public async updateTitle(title: string) {
		const config = await this.promise;
		config.title = title;
		this.registerTitle();
	}

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

	private async initialize(resolve: PromiseResolve<IEpisode>, reject: PromiseReject) {
		if (!(await isFileExist(this.directory))) {
			return reject(new Error(`集文件 ${this.directory} 不存在`));
		}
		if (await isDirectory(this.directory)) {
			return reject(new Error(`集文件 ${this.directory} 不是一个文件`));
		}
		if (!Episode.isAllowedDirectory(this.directory)) {
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
