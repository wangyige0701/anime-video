import type { Series } from '~types/videos';
import type { Response } from '~types/koa-response';
import { DATA_ROUTE } from '@config/route';
import { API } from './base';

/**
 * 获取所有系列信息
 */
export function getSeriesInfos() {
	return API.get(`${DATA_ROUTE}/series`) as unknown as Promise<Response<Series[]>>;
}

export function refreshSeriesInfo() {
	return API.post(`${DATA_ROUTE}/series/refresh`) as unknown as Promise<Response<null>>;
}
