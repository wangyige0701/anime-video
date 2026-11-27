import type { Series, SeriesMergeResult } from '~types/videos';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~shared/server-route-config';
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
	return API.post<any, Series[]>(`${ServerRoot.DATA}/series/refresh`, null, {
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

/**
 * 把 `memberId` 并入 `mainId`（后者成为主系列）。
 *
 * 返回主系列与被并入系列的摘要：被并入系列可能自带成员，前端的两个实例都要同步。
 */
export function mergeSeries(mainId: string, memberId: string) {
	return API.post<any, SeriesMergeResult>(
		`${ServerRoot.DATA}/series/${mainId}/merge`,
		{ memberId },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

/** 让 `memberId` 从 `mainId` 的合并组中脱离 */
export function detachSeries(mainId: string, memberId: string) {
	return API.delete<any, SeriesMergeResult>(`${ServerRoot.DATA}/series/${mainId}/merge/${memberId}`, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

// region 更新系列具体信息

/**
 * 更新系列标题。
 *
 * 传空字符串表示恢复默认标题（系列目录名），返回值为写入后的实际标题。
 */
export function updateSeriesTitle(seriesId: string, title: string) {
	return API.put<any, string>(
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

export function removeSeriesDate(seriesId: string) {
	return API.delete<any, null>(`${ServerRoot.DATA}/series/${seriesId}/date`, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
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

export function removeSeriesStatus(seriesId: string) {
	return API.delete<any, null>(`${ServerRoot.DATA}/series/${seriesId}/status`, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
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
