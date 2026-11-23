import type { Episode } from '~types/videos';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~shared/server-route-config';
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

/** 更新集标题；空字符串表示恢复默认标题（文件名去扩展名），返回值为实际标题 */
export function updateEpisodeTitle(episodeId: string, title: string) {
	return API.put<any, string>(
		`${ServerRoot.DATA}/episode/${episodeId}/title`,
		{ title },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}
