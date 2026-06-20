import type { Season } from '~types/videos';
import { ServerRoot } from '~routes/server';
import { API } from '@/api';

/**
 * 获取系列的所有季
 * @param seriesId 系列ID
 */
export function getSeasons(seriesId: string) {
	return API.get<any, Season[]>(`${ServerRoot.DATA}/seasons/${seriesId}`);
}

/**
 * 获取季详情
 * @param seasonId 季ID
 */
export function getSeasonById(seasonId: string) {
	return API.get<any, Season>(`${ServerRoot.DATA}/season/${seasonId}`);
}

export function updateSeasonSort(seasonId: string, sort: number) {
	return API.put<any, null>(`${ServerRoot.DATA}/season/${seasonId}/sort`, { sort });
}

export function updateSeasonTitle(seasonId: string, title: string) {
	return API.put<any, null>(`${ServerRoot.DATA}/season/${seasonId}/title`, { title });
}
