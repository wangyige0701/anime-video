import type { Season as ISeason } from '~types/videos';
import { Episode } from './episode';
import { Common } from './common';

export class Season extends Common implements Omit<ISeason, 'episodes'> {
	protected static cache: Map<string, Season> = new Map();

	constructor(season: ISeason) {
		if (Season.cache.has(season.id)) {
			return Season.cache.get(season.id)!;
		}

		super();
	}
}
