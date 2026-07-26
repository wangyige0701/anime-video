import type { Episode } from '~types/videos';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~routes/server';
import { API } from '@/api';

/**
 * 获取季的所有集
 * @param seasonId 季ID
 */
export function getEpisodes(seasonId: string) {
	return API.get<any, Episode[]>(`${ServerRoot.DATA}/episodes/${seasonId}`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

/**
 * 获取集详情
 * @param episodeId 集ID
 */
export function getEpisodeById(episodeId: string) {
	return API.get<any, Episode>(`${ServerRoot.DATA}/episode/${episodeId}`, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

export function updateEpisodeSort(episodeId: string, sort: number) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/episode/${episodeId}/sort`,
		{ sort },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

export function updateEpisodeTitle(episodeId: string, title: string) {
	return API.put<any, null>(
		`${ServerRoot.DATA}/episode/${episodeId}/title`,
		{ title },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}
