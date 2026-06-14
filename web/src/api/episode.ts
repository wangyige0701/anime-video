import type { Episode } from '~types/videos';
import { ServerRoot } from '~routes/server';
import { API } from './base';

/**
 * 获取季的所有集
 * @param seasonId 季ID
 */
export function getEpisodes(seasonId: string) {
	return API.get<any, Episode[]>(`${ServerRoot.DATA}/episodes/${seasonId}`);
}

/**
 * 获取集详情
 * @param episodeId 集ID
 */
export function getEpisodeById(episodeId: string) {
	return API.get<any, Episode>(`${ServerRoot.DATA}/episode/${episodeId}`);
}

export function updateEpisodeSort(episodeId: string, sort: number) {
	return API.put<any, null>(`${ServerRoot.DATA}/episode/${episodeId}/sort`, { sort });
}

export function updateEpisodeTitle(episodeId: string, title: string) {
	return API.put<any, null>(`${ServerRoot.DATA}/episode/${episodeId}/title`, { title });
}
