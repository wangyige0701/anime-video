import { VIDEO_INFO_STORAGE_KEY } from '@/config/constants';
import { createPromise, type Fn } from '@wang-yige/utils';

const SERIES_ID_FIELD = 'seriesId';
const SERIES_SEASONS_FIELD = 'seasons';
const SEASON_ID_FIELD = 'seasonId';
const SEASON_EPISODES_FIELD = 'episodes';
const EPISODE_ID_FIELD = 'episodeId';
const VALUE_FIELD = 'v';
const TIMESTAMP_FIELD = 't';
const EXPIRE_TIME = 30 * 24 * 60 * 60 * 1000;

interface StoredField {
	v: unknown;
	t: number;
}

interface StoredEpisode extends Record<string, unknown> {
	episodeId: string;
}

interface StoredSeason extends Record<string, unknown> {
	seasonId: string;
	episodes: StoredEpisode[];
}

interface StoredSeries extends Record<string, unknown> {
	seriesId: string;
	seasons: StoredSeason[];
}

type VideoInfoCache = StoredSeries[];

/**
 * 管理指定 series、season、episode 的视频播放信息缓存。
 *
 * 所有读写方法都是异步的，当前使用 localStorage，后续可以无感迁移到 IndexedDB。
 * 可写字段会以 `{ v: value, t: timestamp }` 的形式保存，读取时会自动清理过期字段。
 * 当一个层级及其子层级都没有可用字段时，对应的缓存节点会被删除。
 *
 * @example
 * ```ts
 * const storage = new VideoInfoStorage(seriesId, seasonId, episodeId);
 *
 * await storage.setEpisode(VideoInfoStorage.CURRENT_TIME_FIELD, 120);
 * const currentTime = await storage.getEpisode<number>(VideoInfoStorage.CURRENT_TIME_FIELD);
 *
 * await storage.setSeries('lastSeasonId', seasonId);
 * const lastSeasonId = await storage.getSeries<string>('lastSeasonId');
 * ```
 */
export class VideoInfoStorage {
	private static queue: Map<string, { timeout?: number; promise?: Promise<void>; resolves?: Array<Fn<[]>> }> =
		new Map();

	public static async get<T>(key: string, defaultValue?: T): Promise<T> {
		if (this.queue.has(key)) {
			const { promise } = this.queue.get(key)!;
			if (promise) {
				await promise;
			}
		}
		try {
			const value = JSON.parse(localStorage.getItem(key)!) as { v: T; t: number; __persist: boolean };
			if (!value.__persist && Date.now() - value.t > EXPIRE_TIME) {
				await this.delete(key);
				return defaultValue as T;
			}
			return value?.v ?? (defaultValue as T);
		} catch (error) {
			return defaultValue as T;
		}
	}

	public static async set<T>(key: string, value: T, persist: boolean = false): Promise<void> {
		if (this.queue.has(key)) {
			const timeout = this.queue.get(key)!.timeout;
			timeout && clearTimeout(timeout);
		} else {
			this.queue.set(key, {});
		}
		const target = this.queue.get(key)!;
		if (!target.resolves) {
			target.resolves = [];
		}
		const { promise, resolve } = createPromise<void>();
		target.promise = promise;
		target.resolves.push(resolve);
		target.timeout = setTimeout(() => {
			try {
				localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now(), __persist: persist }));
			} catch (error) {}
			target.resolves!.forEach((resolve) => resolve());
			target.resolves!.length = 0;
			if (promise === target.promise) {
				target.promise = undefined;
				target.timeout = undefined;
				this.queue.delete(key);
			}
		}, 100);
		return promise;
	}

	public static async delete(key: string): Promise<void> {
		localStorage.removeItem(key);
	}

	public static readonly CURRENT_TIME_FIELD = 'currentTime';
	private static readonly RESERVED = new Set([
		SERIES_ID_FIELD,
		SERIES_SEASONS_FIELD,
		SEASON_ID_FIELD,
		SEASON_EPISODES_FIELD,
		EPISODE_ID_FIELD,
		VALUE_FIELD,
		TIMESTAMP_FIELD,
	]);
	private static cache: VideoInfoCache | null = null;
	private static persistTimer: ReturnType<typeof setTimeout> | undefined;

	private static async getValue(): Promise<VideoInfoCache> {
		if (this.cache) {
			return this.cache;
		}
		try {
			const stored = await this.get(VIDEO_INFO_STORAGE_KEY, []);
			this.cache = Array.isArray(stored) ? (stored as VideoInfoCache) : [];
		} catch {
			this.cache = [];
		}
		return this.cache;
	}

	private static schedulePersist(value: VideoInfoCache) {
		if (this.persistTimer !== void 0) {
			clearTimeout(this.persistTimer);
		}
		this.persistTimer = setTimeout(() => {
			this.persistTimer = void 0;
			try {
				this.set(VIDEO_INFO_STORAGE_KEY, value, true);
			} catch {
				// Storage can be unavailable or full; the in-memory cache remains usable.
			}
		}, 500);
	}

	private static cleanup(videoInfo: VideoInfoCache) {
		for (const series of videoInfo) {
			if (!Array.isArray(series[SERIES_SEASONS_FIELD])) {
				series[SERIES_SEASONS_FIELD] = [];
			}
			for (const season of series[SERIES_SEASONS_FIELD]) {
				if (!Array.isArray(season[SEASON_EPISODES_FIELD])) {
					season[SEASON_EPISODES_FIELD] = [];
				}
				season[SEASON_EPISODES_FIELD] = season[SEASON_EPISODES_FIELD].filter((episode) =>
					VideoInfoStorage.hasStoredFields(episode),
				);
			}
			series[SERIES_SEASONS_FIELD] = series[SERIES_SEASONS_FIELD].filter(
				(season) => VideoInfoStorage.hasStoredFields(season) || season[SEASON_EPISODES_FIELD].length > 0,
			);
		}
		videoInfo.splice(
			0,
			videoInfo.length,
			...videoInfo.filter(
				(series) => VideoInfoStorage.hasStoredFields(series) || series[SERIES_SEASONS_FIELD].length > 0,
			),
		);
	}

	private static hasStoredFields(node: StoredSeries | StoredSeason | StoredEpisode) {
		return Object.keys(node).some(
			(key) => !VideoInfoStorage.RESERVED.has(key) && VideoInfoStorage.isStored(node[key]),
		);
	}

	private static isStored(value: unknown): value is StoredField {
		return (
			typeof value === 'object' &&
			value !== null &&
			typeof (value as StoredField)[TIMESTAMP_FIELD] === 'number' &&
			Number.isFinite((value as StoredField)[TIMESTAMP_FIELD]) &&
			Object.hasOwn(value, VALUE_FIELD)
		);
	}

	public static create(seriesId: string, seasonId: string, episodeId: string) {
		return new VideoInfoStorage(seriesId, seasonId, episodeId);
	}

	constructor(
		private seriesId: string,
		private seasonId: string,
		private episodeId: string,
	) {}

	public async getSeries<T = unknown>(key: string): Promise<T | undefined> {
		if (!this.canRead(key, this.seriesId)) {
			return;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		const series = await this.findSeries(videoInfo);
		return await this.readField<T>(videoInfo, series, key);
	}

	public async getSeason<T = unknown>(key: string): Promise<T | undefined> {
		if (!this.canRead(key, this.seriesId) || !this.seasonId) {
			return;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		const season = await this.findSeason(videoInfo);
		return await this.readField<T>(videoInfo, season, key);
	}

	public async getEpisode<T = unknown>(key: string): Promise<T | undefined> {
		if (!this.canRead(key, this.seriesId) || !this.seasonId || !this.episodeId) {
			return;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		const episode = await this.findEpisode(videoInfo);
		return await this.readField<T>(videoInfo, episode, key);
	}

	public async setSeries(key: string, value: unknown): Promise<boolean> {
		if (!this.canWrite(key, this.seriesId)) {
			return false;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		let series = await this.findSeries(videoInfo);
		if (!series) {
			series = { [SERIES_ID_FIELD]: this.seriesId, [SERIES_SEASONS_FIELD]: [] };
			videoInfo.push(series);
		}
		series[key] = this.createField(value);
		VideoInfoStorage.schedulePersist(videoInfo);
		return true;
	}

	public async setSeason(key: string, value: unknown): Promise<boolean> {
		if (!this.canWrite(key, this.seriesId) || !this.seasonId) {
			return false;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		let series = await this.findSeries(videoInfo);
		if (!series) {
			series = { [SERIES_ID_FIELD]: this.seriesId, [SERIES_SEASONS_FIELD]: [] };
			videoInfo.push(series);
		}
		if (!Array.isArray(series[SERIES_SEASONS_FIELD])) {
			series[SERIES_SEASONS_FIELD] = [];
		}
		let season = await this.findSeason(videoInfo);
		if (!season) {
			season = { [SEASON_ID_FIELD]: this.seasonId, [SEASON_EPISODES_FIELD]: [] };
			series[SERIES_SEASONS_FIELD].push(season);
		}
		season[key] = this.createField(value);
		VideoInfoStorage.schedulePersist(videoInfo);
		return true;
	}

	public async setEpisode(key: string, value: unknown): Promise<boolean> {
		if (!this.canWrite(key, this.seriesId) || !this.seasonId || !this.episodeId) {
			return false;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		let series = await this.findSeries(videoInfo);
		if (!series) {
			series = { [SERIES_ID_FIELD]: this.seriesId, [SERIES_SEASONS_FIELD]: [] };
			videoInfo.push(series);
		}
		if (!Array.isArray(series[SERIES_SEASONS_FIELD])) {
			series[SERIES_SEASONS_FIELD] = [];
		}
		let season = await this.findSeason(videoInfo);
		if (!season) {
			season = { [SEASON_ID_FIELD]: this.seasonId, [SEASON_EPISODES_FIELD]: [] };
			series[SERIES_SEASONS_FIELD].push(season);
		}
		if (!Array.isArray(season[SEASON_EPISODES_FIELD])) {
			season[SEASON_EPISODES_FIELD] = [];
		}
		let episode = await this.findEpisode(videoInfo);
		if (!episode) {
			episode = { [EPISODE_ID_FIELD]: this.episodeId };
			season[SEASON_EPISODES_FIELD].push(episode);
		}
		episode[key] = this.createField(value);
		VideoInfoStorage.schedulePersist(videoInfo);
		return true;
	}

	public async deleteSeries(key: string): Promise<boolean> {
		return this.deleteField('series', key);
	}

	public async deleteSeason(key: string): Promise<boolean> {
		if (!this.seasonId) {
			return false;
		}
		return this.deleteField('season', key);
	}

	public async deleteEpisode(key: string): Promise<boolean> {
		if (!this.seasonId || !this.episodeId) {
			return false;
		}
		return this.deleteField('episode', key);
	}

	private createField(value: unknown): StoredField {
		return { [VALUE_FIELD]: value, [TIMESTAMP_FIELD]: Date.now() };
	}

	private async readField<T>(
		videoInfo: VideoInfoCache,
		node: StoredSeries | StoredSeason | StoredEpisode | undefined,
		key: string,
	): Promise<T | undefined> {
		if (!node || !Object.hasOwn(node, key)) {
			return;
		}
		const field = node[key];
		if (!this.isStoredField(field)) {
			return;
		}
		if (Date.now() - field[TIMESTAMP_FIELD] > EXPIRE_TIME) {
			delete node[key];
			VideoInfoStorage.cleanup(videoInfo);
			VideoInfoStorage.schedulePersist(videoInfo);
			return;
		}
		return field[VALUE_FIELD] as T;
	}

	private isStoredField(value: unknown): value is StoredField {
		return VideoInfoStorage.isStored(value);
	}

	private canRead(key: string, seriesId: string) {
		return (
			Boolean(seriesId) &&
			Boolean(key) &&
			!VideoInfoStorage.RESERVED.has(key) &&
			key !== '__proto__' &&
			key !== 'constructor' &&
			key !== 'prototype'
		);
	}

	private canWrite(key: string, seriesId: string) {
		return this.canRead(key, seriesId);
	}

	private async deleteField(scope: 'series' | 'season' | 'episode', key: string): Promise<boolean> {
		if (!this.canRead(key, this.seriesId)) {
			return false;
		}
		const videoInfo = await VideoInfoStorage.getValue();
		const node =
			scope === 'series'
				? await this.findSeries(videoInfo)
				: scope === 'season'
					? await this.findSeason(videoInfo)
					: await this.findEpisode(videoInfo);
		if (!node || !Object.hasOwn(node, key)) {
			return false;
		}
		delete node[key];
		VideoInfoStorage.cleanup(videoInfo);
		VideoInfoStorage.schedulePersist(videoInfo);
		return true;
	}

	private async findSeries(value?: VideoInfoCache) {
		const videoInfo = value ?? (await VideoInfoStorage.getValue());
		return videoInfo.find((item) => item?.[SERIES_ID_FIELD] === this.seriesId);
	}

	private async findSeason(value?: VideoInfoCache) {
		const videoInfo = value ?? (await VideoInfoStorage.getValue());
		const series = await this.findSeries(videoInfo);
		if (!series || !Array.isArray(series[SERIES_SEASONS_FIELD])) {
			return;
		}
		return series[SERIES_SEASONS_FIELD].find((item) => item?.[SEASON_ID_FIELD] === this.seasonId);
	}

	private async findEpisode(value?: VideoInfoCache) {
		const videoInfo = value ?? (await VideoInfoStorage.getValue());
		const season = await this.findSeason(videoInfo);
		if (!season || !Array.isArray(season[SEASON_EPISODES_FIELD])) {
			return;
		}
		return season[SEASON_EPISODES_FIELD].find((item) => item?.[EPISODE_ID_FIELD] === this.episodeId);
	}
}
