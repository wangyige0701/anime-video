import type { Series } from '~types/videos';
import type { Response } from '~types/response';
import { ServerRoot } from '~routes/server';
import { API } from './base';

/**
 * 获取所有系列信息，不包含视频集和视频季信息
 */
export function getSeries() {
	return API.get(`${ServerRoot.DATA}/series`) as unknown as Promise<Response<Series[]>>;
}

export function refreshSeries() {
	return API.post(`${ServerRoot.DATA}/series/refresh`) as unknown as Promise<Response<null>>;
}

export function getDetailSeries(seriesId: string) {
	return API.get(`${ServerRoot.DATA}/series/${seriesId}`) as unknown as Promise<Response<Series>>;
}
