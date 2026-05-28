import { Singleton } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Season as ISeason, ServerToPromise } from '~types/videos';
import type { Episode } from './episode';
import { isDirectory } from '@server/src/utils';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import { Data } from './data';
import type { Series } from './series';

@Singleton()
export class Season implements Omit<ServerToPromise<ISeason>, 'episodes'> {
	private static cache: Map<string, Season> = new Map();

	public static async getAllSeasons(seriesDirectory: string, seasons: ISeason[], series: Series) {
		const result = [] as Season[];
		for (const file of await fs.readdir(seriesDirectory)) {
			if (!(await isDirectory(file))) {
				continue;
			}
			const seasonDirectory = path.resolve(seriesDirectory, file);
			result.push(new Season(seasonDirectory, seasons, series));
		}

		const needRemove = [] as Season[];
		for (const season of result) {
			const pathName = await season.pathName;
			if (!seasons.find((item) => item.pathName === pathName)) {
				needRemove.push(season);
			}
		}

		return result;
	}

	id!: Promise<string>;
	seasonNumber!: Promise<number>;
	pathName!: Promise<string>;
	title!: Promise<string>;
	episodes!: Promise<Episode[]>;

	/**
	 * 季完整路径
	 */
	fullPath!: Promise<string>;

	private directory!: string;
	private promise!: Promise<ISeason>;

	/**
	 * @param seasonDirectory 季目录
	 * @param seasons 当前系列下的所有季数据，用来进行过滤判断
	 * @returns
	 */
	constructor(
		seasonDirectory: string,
		seasons: ISeason[],
		private series: Series,
	) {
		const directory = path.resolve(seasonDirectory);

		if (Season.cache.has(directory)) {
			return Season.cache.get(directory)!;
		}

		Season.cache.set(directory, this);

		this.directory = directory;

		const { resolve, reject, promise } = createPromise<ISeason>();
		this.promise = promise;

		this.registerId();
		this.registerSeasonNumber();
		this.registerPathName();
		this.registerTitle();
		this.registerFullPath();

		this.initialize(resolve, reject);
	}

	public getPromise() {
		return this.promise;
	}

	private registerId() {
		this.id = this.promise.then(({ id }) => id);
	}

	private registerSeasonNumber() {
		this.seasonNumber = this.promise.then(({ seasonNumber }) => seasonNumber);
	}

	private registerPathName() {
		this.pathName = this.promise.then(({ pathName }) => pathName);
	}

	private registerTitle() {
		this.title = this.promise.then(({ title }) => title);
	}

	private registerFullPath() {
		this.fullPath = Promise.all([this.series.rootPath, this.promise]).then(([rootPath, { pathName }]) => {
			return path.resolve(rootPath, pathName);
		});
	}

	private async initialize(resolve: PromiseResolve<ISeason>, reject: PromiseReject) {}
}
