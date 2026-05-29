import { M3u8Config } from '~config/hls';

export enum ServerRoot {
	VIDEO = '/video',
	DATA = '/data',
	IMAGE = '/image',
}

const SERVER_URL = 'http://localhost:3000';

export function getMasterM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${M3u8Config.MASTER_M3U8_NAME}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${streamIndex}/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`;
}

export function getImageUrl(pathName: string) {
	return `${SERVER_URL}${ServerRoot.IMAGE}/${encodeURIComponent(pathName)}`;
}
