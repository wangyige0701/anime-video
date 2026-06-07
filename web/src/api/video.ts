import type { Series } from '~types/videos';
import { ServerRoot } from '~routes/server';
import { API } from './base';

/**
 * 获取所有系列信息，不包含视频集和视频季信息
 */
export function getSeries() {
	return API.get<any, Series[]>(`${ServerRoot.DATA}/series`);
}

export function refreshSeries() {
	return API.post<any, null>(`${ServerRoot.DATA}/series/refresh`);
}

export function getSeriesDetail(seriesId: string) {
	return API.get<any, Series>(`${ServerRoot.DATA}/series/${seriesId}`);
}
