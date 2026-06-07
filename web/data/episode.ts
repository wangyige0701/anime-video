import type { Episode as IEpisode } from '~types/videos';
import { Common } from './common';

export class Episode extends Common implements IEpisode {
	protected static cache: Map<string, Episode> = new Map();

	constructor(episode: IEpisode) {
		if (Episode.cache.has(episode.id)) {
			return Episode.cache.get(episode.id)!;
		}

		super();
	}
}
