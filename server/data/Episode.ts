import type { Episode as IEpisode, ServerToPromise } from '~types/videos';

export class Episode implements ServerToPromise<IEpisode> {
	id: Promise<string>;
	episodeNumber: Promise<number>;
	pathName: Promise<string>;
	extension: Promise<string>;
	title: Promise<string>;
}
