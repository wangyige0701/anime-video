import path from 'node:path';
import fs from 'node:fs/promises';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import type { Episode as IEpisode } from '~types/videos';
import type { EpisodeKind } from '~shared/episode-kind';
import { isEpisodeKind } from '~shared/episode-kind';
import type { Season } from './season';
import { isDirectory, isFileExist } from '~server/src/utils/fs';
import { Entity, type FieldReaders, type ServerToPromise } from './entity';

const SERVER = __APP_CONFIG__.server;

export class Episode extends Entity<IEpisode, IEpisode> implements ServerToPromise<IEpisode> {
	protected static cache: Map<string, Episode> = new Map();

	/** 对外 DTO 字段，顺序与 `getValue()` 的键顺序一致 */
	private static readonly VALUE_FIELDS = ['id', 'sort', 'path', 'extension', 'title', 'kind'] as const;

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
			if (!entry.isFile() || !SERVER.allowedVideoExtensions.includes(extension)) {
				continue;
			}
			const episode = new Episode(entry.name, season);
			await episode.getPromise();
			// 缓存的实例可能已持有派生值，初始化后统一重新派生一次。
			episode.invalidate();
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

	private episodeName!: string;
	private directory!: string;
	private hashId!: string;

	/**
	 * 配置中的 `path` 只是集文件名，对外必须是绝对路径。
	 * 该映射必须留在字段定义里，`getValue()` 通过 `collect()` 取值时才会生效。
	 */
	protected readonly readers: FieldReaders<IEpisode, IEpisode> = {
		path: (store) => path.join(this.season.getDirectory(), store.path),
	};

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
		this.store = promise;
		const fail: PromiseReject = (error) => {
			// 失败实例不保留在缓存中，后续修复文件后可正常重新初始化。
			Episode.cache.delete(id);
			reject(error);
		};

		this.initialize(resolve, fail).catch(fail);
	}

	/**
	 * 获取视频集信息
	 */
	public async getValue(): Promise<IEpisode> {
		return { ...(await this.collect(Episode.VALUE_FIELDS)) };
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
		return this.store;
	}

	public getPromise() {
		return this.store;
	}

	// region 属性代理
	public get id() {
		return this.field('id');
	}

	public get sort() {
		return this.field('sort');
	}

	public get path() {
		return this.field('path');
	}

	public get extension() {
		return this.field('extension');
	}

	public get title() {
		return this.field('title');
	}

	public get kind() {
		return this.field('kind');
	}
	// endregion

	// region 更新集数据
	public async updateSort(sort: number) {
		await this.store;
		await this.season.updateEpisodeSort(() => this, Math.max(1, sort));
		this.invalidate();
	}

	/**
	 * 更新排序时，由 Season 调用，重新派生排序字段
	 */
	public async rewriteSort(sort: number) {
		await this.write('sort', sort);
	}

	/** 更新集标题；空标题（含纯空白）恢复默认标题，即文件名去掉扩展名 */
	public async updateTitle(title: string) {
		const fallback = path.basename(this.episodeName, path.extname(this.episodeName));
		await this.write('title', title.trim() || fallback);
	}

	/**
	 * 更新集类型（正片 / 特别篇）。
	 *
	 * 只影响标注与同步时的分类，不参与排序：集在季里的位置始终由文件名顺序决定。
	 */
	public async updateKind(kind: EpisodeKind) {
		await this.write('kind', isEpisodeKind(kind) ? kind : 'main');
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
				kind: 'main',
			});
		}
		const config = configs.find((config) => config.id === id)!;
		config.id = id;
		config.sort = config.sort || sort;
		config.path = baseName;
		config.extension = extension;
		config.title = config.title || fileName;
		// 历史配置没有 kind，按正片补齐，避免 DTO 漏字段
		config.kind = isEpisodeKind(config.kind) ? config.kind : 'main';
		resolve(config);
	}
}
