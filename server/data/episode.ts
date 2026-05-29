import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Episode as IEpisode, ServerToPromise } from '~types/videos';
import type { Season } from './season';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Common } from './common';

export class Episode extends Common implements ServerToPromise<IEpisode> {
	private static cache: Map<string, Episode> = new Map();

	public static async getAllEpisodes(season: Season) {
		const result = [] as Episode[];
		for (const file of await fs.readdir(season.getDirectory())) {
			const filePath = path.join(season.getDirectory(), file);
			if (await isDirectory(filePath)) {
				continue;
			}
			const episode = new Episode(file, season);
			await episode.getPromise();
			result.push(episode);
		}

		// 移除不存在的视频实例
		const ids = await Promise.all(result.map((item) => item.id));
		const episodes = (await season.getConfig()).episodes || [];
		for (let i = episodes.length - 1; i >= 0; i--) {
			const episode = episodes[i];
			if (!ids.find((id) => id === episode.id)) {
				episodes.splice(i, 1);
			}
		}

		episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

		return result;
	}

	private _id!: Promise<string>;
	private _episodeNumber!: Promise<number>;
	private _pathName!: Promise<string>;
	private _extension!: Promise<string>;
	private _title!: Promise<string>;

	private episodeName!: string;
	private directory!: string;
	private promise!: Promise<IEpisode>;

	constructor(
		episodeName: string,
		private season: Season,
	) {
		const directory = path.join(season.getDirectory(), episodeName);

		if (Episode.cache.has(directory)) {
			return Episode.cache.get(directory)!;
		}

		super();

		Episode.cache.set(directory, this);

		this.episodeName = episodeName;
		this.directory = directory;

		const { resolve, reject, promise } = createPromise<IEpisode>();
		this.promise = promise;

		this.registerId();
		this.registerEpisodeNumber();
		this.registerPathName();
		this.registerExtension();
		this.registerTitle();
	}

	public getSeason() {
		return this.season;
	}

	public getDirectory() {
		return this.directory;
	}

	public getEpisodeName() {
		return this.episodeName;
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

	public get episodeNumber() {
		return this._episodeNumber;
	}

	public get pathName() {
		return this._pathName;
	}

	public get extension() {
		return this._extension;
	}

	public get title() {
		return this._title;
	}

	public async updateEpisodeNumber(episodeNumber: number) {
		const config = await this.promise;
		config.episodeNumber = Math.max(1, episodeNumber);
		this.registerEpisodeNumber();
	}

	public async updateTitle(title: string) {
		const config = await this.promise;
		config.title = title;
		this.registerTitle();
	}

	private registerId() {
		this._id = this.promise.then(({ id }) => id);
	}

	private registerEpisodeNumber() {
		this._episodeNumber = this.promise.then(({ episodeNumber }) => episodeNumber);
	}

	private registerPathName() {
		this._pathName = this.promise.then(({ pathName }) => pathName);
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
		const id = Episode.hash(this.directory);
		const episodeNumber = Math.max(1, ...configs.map((item) => item.episodeNumber)) + 1;
		const extension = path.extname(this.directory);
		const fileName = path.basename(this.directory, extension);
		const baseName = path.basename(this.directory);
		if (!configs.find((config) => config.id === id)) {
			configs.push({
				id: id,
				episodeNumber: episodeNumber,
				pathName: baseName,
				extension: extension,
				title: fileName,
			});
		}
		const config = configs.find((config) => config.id === id)!;
		config.id = id;
		config.episodeNumber = config.episodeNumber || episodeNumber;
		config.pathName = baseName;
		config.extension = extension;
		config.title = config.title || fileName;
		resolve(config);
	}
}
