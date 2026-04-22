import type { Series } from '~types/videos';
import type { Response } from '~types/koa-response';
import { ServerRoot } from '~routes/server';
import { API } from './base';

/**
 * 获取所有系列信息
 */
export function getSeriesInfos() {
	return API.get(`${ServerRoot.DATA}/series`) as unknown as Promise<Response<Series[]>>;
}

export function refreshSeriesInfo() {
	return API.post(`${ServerRoot.DATA}/series/refresh`) as unknown as Promise<Response<null>>;
}
