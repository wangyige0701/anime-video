import { M3u8Config } from '@config/hls';

export const VIDEO_ROUTE = '/video';
export const DATA_ROUTE = '/data';
export const IMAGE_ROUTE = '/image';

export function getMasterM3u8Url(videoName: string) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${M3u8Config.MASTER_M3U8_NAME}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${VIDEO_ROUTE}/${encodeURIComponent(videoName)}/${streamIndex}/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`;
}

export function getImageUrl(pathName: string) {
	return `${IMAGE_ROUTE}/${encodeURIComponent(pathName)}`;
}
