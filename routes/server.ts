export enum ServerRoot {
	VIDEO = '/video',
	DATA = '/data',
	IMAGE = '/image',
}

const SERVER = __APP_CONFIG__.server;
const HLS = __APP_CONFIG__.hls;
export const SERVER_URL = `${SERVER.protocol}://${SERVER.host}:${SERVER.port}`;

export function getMasterM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${HLS.masterM3u8Name}.m3u8`;
}

export function getMediaM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${HLS.mediaM3u8Name}.m3u8`;
}

export function getSubtitleM3u8Url(videoName: string, streamIndex: number) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${streamIndex}/${HLS.subtitleM3u8Name}.m3u8`;
}

export function getImageM3u8Url(videoName: string) {
	return `${SERVER_URL}${ServerRoot.VIDEO}/${encodeURIComponent(videoName)}/${HLS.imageM3u8Name}.m3u8`;
}

export function getImageUrl(pathName: string) {
	return `${SERVER_URL}${ServerRoot.IMAGE}/${encodeURIComponent(pathName)}`;
}
