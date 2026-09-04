export enum ServerRoot {
	VIDEO = '/video',
	DATA = '/data',
	IMAGE = '/image',
}

export const SERVER_URL = `${__APP_CONFIG__.server.protocol}://${__APP_CONFIG__.server.host}:${__APP_CONFIG__.server.port}`;

export function getMasterM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${__APP_CONFIG__.hls.masterM3u8Name}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${__APP_CONFIG__.hls.mediaM3u8Name}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${streamIndex}/${__APP_CONFIG__.hls.subtitleM3u8Name}.m3u8`;
}

export function getImageM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${__APP_CONFIG__.hls.imageM3u8Name}.m3u8`;
}

export function getImageUrl(pathName: string) {
	return `${SERVER_URL}${ServerRoot.IMAGE}/${encodeURIComponent(pathName)}`;
}
