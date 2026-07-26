import type { Season } from '~types/videos';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~routes/server';
import { API } from '@/api';

/**
 * 获取系列的所有季
 * @param seriesId 系列ID
 */
export function getSeasons(seriesId: string) {
	return API.get<any, Season[]>(`${ServerRoot.DATA}/seasons/${seriesId}`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

/**
 * 获取季详情
 * @param seasonId 季ID
 */
export function getSeasonById(seasonId: string) {
	return API.get<any, Season>(`${ServerRoot.DATA}/season/${seasonId}`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

export function updateSeasonSort(seasonId: string, sort: number) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/season/${seasonId}/sort`,
		{ sort },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateSeasonTitle(seasonId: string, title: string) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/season/${seasonId}/title`,
		{ title },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}
