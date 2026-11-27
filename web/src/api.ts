import type { Response } from '~types/response';
import { SERVER_URL } from '~shared/server-route-config';
import { AxiosRequest, axios } from 'axios-useful';
import { isBoolean, isNumber } from '@wang-yige/utils';
import { getApiErrorMessage } from '@/utils/apiError';

export const API = new AxiosRequest(SERVER_URL);

API.interceptors.response.use(
	(response) => {
		const data = response.data as Response<any>;
		if (isNumber(data.code) && isBoolean(data.success)) {
			if (data.success) {
				return data.data as any;
			}
			throw new Error(data.message);
		}
		return data;
	},
	(error) => {
		// 主动取消不算失败：翻页、重发请求都会走到这里，提示反而干扰操作
		if (error instanceof axios.CanceledError) {
			throw error;
		}
		// 文案统一在 utils/apiError 里决定，避免把 axios 的英文原文弹给用户
		const message = getApiErrorMessage(error);
		if (message) {
			ElMessage.error(message);
		}
		throw error;
	},
);
