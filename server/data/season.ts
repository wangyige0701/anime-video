import { Singleton } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Season as ISeason, ServerToPromise } from '~types/videos';
import type { Episode } from './episode';
import { isDirectory } from '@server/src/utils';
import { createPromise, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import { Data } from './data';

@Singleton()
export class Season extends Data implements Omit<ServerToPromise<ISeason>, 'episodes'> {
	private static cache: Map<string, Season> = new Map();

	public static async getAllSeasons(seriesDirectory: string, seasons: ISeason[]) {
		const result = [] as ISeason[];
		for (const file of await fs.readdir(seriesDirectory)) {
			if (!(await isDirectory(file))) {
				continue;
			}
			const season = seasons.find((season) => season.pathName === file);
			const seasonDirectory = path.resolve(seriesDirectory, file);
			new Season(seasonDirectory);
		}
		return result;
	}

	id!: Promise<string>;
	seasonNumber!: Promise<number>;
	pathName!: Promise<string>;
	title!: Promise<string>;
	episodes!: Promise<Episode[]>;

	private directory!: string;
	private promise!: Promise<ISeason>;

	constructor(seasonDirectory: string) {
		const directory = path.resolve(seasonDirectory);

		if (Season.cache.has(directory)) {
			return Season.cache.get(directory)!;
		}

		super();

		Season.cache.set(directory, this);

		this.directory = directory;

		const { resolve, reject, promise } = createPromise<ISeason>();
		this.promise = promise;

		this.initialize(resolve, reject);
	}

	private async initialize(resolve: PromiseResolve<ISeason>, reject: PromiseReject) {}
}
