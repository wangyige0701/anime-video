import type {
	BangumiApplyInput,
	BangumiApplyResult,
	BangumiMatchResult,
	BangumiPreviewResult,
} from '@/@types/bangumi-sync';
import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~shared/server-route-config';
import { API } from '@/api';

/**
 * Bangumi 同步三段接口。
 *
 * 前两段只读、不落库，最后一段才写入；三段都走 `PREV` 单请求策略，
 * 避免用户在确认前连续点击产生互相覆盖的结果。
 */

/** 搜索并生成季与条目的匹配建议 */
export function matchBangumi(seriesId: string) {
	return API.post<any, BangumiMatchResult>(`${ServerRoot.DATA}/series/${seriesId}/bangumi/match`, null, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

/** 按确认的季映射拉取详情，生成待确认的变更 */
export function previewBangumi(seriesId: string, seasons: Array<{ seasonId: string; subjectIds: number[] }>) {
	return API.post<any, BangumiPreviewResult>(
		`${ServerRoot.DATA}/series/${seriesId}/bangumi/preview`,
		{ seasons },
		{
			single: {
				type: AxiosRequest.Single.PREV,
			},
		},
	);
}

/** 写入勾选的字段、标题与排序 */
export function applyBangumi(seriesId: string, input: BangumiApplyInput) {
	return API.post<any, BangumiApplyResult>(`${ServerRoot.DATA}/series/${seriesId}/bangumi/apply`, input, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}
