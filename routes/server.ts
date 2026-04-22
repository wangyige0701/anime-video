import { M3u8Config } from '@config/hls';

export enum ServerRoot {
	VIDEO = '/video',
	DATA = '/data',
	IMAGE = '/image',
}

export function getMasterM3u8Url(videoName: string) {
	return `${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${M3u8Config.MASTER_M3U8_NAME}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${streamIndex}/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`;
}

export function getImageUrl(pathName: string) {
	return `${ServerRoot.IMAGE}/${encodeURIComponent(pathName)}`;
}
