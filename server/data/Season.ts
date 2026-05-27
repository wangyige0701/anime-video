import { Singleton } from 'koa-use-decorator-router';
import type { Season as ISeason, ServerToPromise } from '~types/videos';
import type { Episode } from './Episode';

@Singleton()
export class Season implements ServerToPromise<ISeason> {
	id: Promise<string>;
	seasonNumber: Promise<number>;
	pathName: Promise<string>;
	title: Promise<string>;
	episodes: Promise<Episode[]>;

	private season: ISeason;

	constructor(seasonPath: string) {}
}
