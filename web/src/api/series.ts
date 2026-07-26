import type { Series } from '~types/videos';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~routes/server';
import { API } from '@/api';

/**
 * 获取所有系列信息，不包含视频集和视频季信息
 */
export function getSeries() {
	return API.get<any, Series[]>(`${ServerRoot.DATA}/series`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

export function refreshSeries() {
	return API.post<any, null>(`${ServerRoot.DATA}/series/refresh`, null, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

export function refreshSeriesById(seriesId: string) {
	return API.post<any, null>(`${ServerRoot.DATA}/series/refresh/${seriesId}`, null, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

export function getSeriesDetail(seriesId: string) {
	return API.get<any, Series>(`${ServerRoot.DATA}/series/${seriesId}`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

// region 更新系列具体信息

export function updateSeriesTitle(seriesId: string, title: string) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/title`,
		{ title },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeriesDescription(seriesId: string, description: string) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/description`,
		{ description },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeriesDate(seriesId: string, year: number, month: number) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/date`,
		{ year, month },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeriesStatus(seriesId: string, status: number) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/status`,
		{ status },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeriesTypes(type: 'add' | 'remove' | 'set', seriesId: string, types: number[]) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/types/${type}`,
		{ types },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeriesImages(type: 'add' | 'remove' | 'set', seriesId: string, images: string[]) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/series/${seriesId}/images/${type}`,
		{ images },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

// endregion
