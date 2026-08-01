import mitt from 'mitt';

export type VideoEvents = {
	video: {
		seriesTitle: string;
		seasonTitle: string;
		episodeTitle: string;
		url: string;
	};
	play: void;
	pause: void;
};

export const videoEmitter = mitt<VideoEvents>();
