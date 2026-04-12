import { VIDEO_ROUTE } from '@config/route';

export enum M3u8Config {
	MASTER_M3U8_NAME = 'master',
	MEDIA_M3U8_NAME = 'media',
	SUBTITLE_M3U8_NAME = 'subtitle',
}

export const SEGMENT_MIN_DURATION = 4;

export function getMasterM3u8Url(videoName: string) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${M3u8Config.MASTER_M3U8_NAME}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${streamIndex}/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`;
}
