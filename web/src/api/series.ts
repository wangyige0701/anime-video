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

// region 更新系列具体信息

export function updateSeriesTitle(seriesId: string, title: string) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/title`, { title });
}

export function updateSeriesDescription(seriesId: string, description: string) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/description`, { description });
}

export function updateSeriesDate(seriesId: string, year: number, month: number) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/date`, { year, month });
}

export function updateSeriesStatus(seriesId: string, status: number) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/status`, { status });
}

export function updateSeriesTypes(type: 'add' | 'remove' | 'set', seriesId: string, types: number[]) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/types/${type}`, { types });
}

export function updateSeriesImages(type: 'add' | 'remove' | 'set', seriesId: string, images: string[]) {
	return API.put<any, null>(`${ServerRoot.DATA}/series/${seriesId}/images/${type}`, { images });
}
