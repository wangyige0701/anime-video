export interface VideoPlayData {
	seriesTitle: string;
	seriesId: string;
	seasonTitle: string;
	seasonId: string;
	episodeTitle: string;
	episodeId: string;
	videoPath: string;
	currentTime?: number;
}

export interface VideoInfoEpisode extends Record<string, unknown> {
	episodeId: string;
	t: number;
	currentTime?: number;
}

export interface VideoInfoSeason extends Record<string, unknown> {
	seasonId: string;
	t: number;
	episodes: VideoInfoEpisode[];
}

export interface VideoInfoSeries extends Record<string, unknown> {
	seriesId: string;
	t: number;
	seasons: VideoInfoSeason[];
}

export type VideoInfoStore = VideoInfoSeries[];
