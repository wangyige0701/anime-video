import type { Response } from '~types/response';
import { SERVER_URL } from '~shared/server-route-config';
import { CSRF_HEADER } from '~shared/csrf';
import { AxiosRequest, axios } from 'axios-useful';
import { isBoolean, isNumber } from '@wang-yige/utils';
import { getApiErrorMessage } from '@/utils/apiError';
import { getCsrfToken, isSafeMethod } from '@/utils/csrf';

export const API = new AxiosRequest(SERVER_URL);

/**
 * 写操作补上 CSRF 令牌。
 *
 * 令牌来自页面里的 meta（见 `utils/csrf.ts`），不需要先请求接口；只读请求不加，
 * 免得首屏的一堆 GET 都挂一个用不上的头。
 *
 * 失效时不静默重试：页面里的令牌不会自己变新，重试只会再失败一次。服务端返回的
 * 403 文案就是「请刷新页面后重试」，由统一错误提示弹出。
 */
API.interceptors.request.use((config) => {
	if (!isSafeMethod(config.method)) {
		const token = getCsrfToken();
		if (token) {
			config.headers.set(CSRF_HEADER, token);
		}
	}
	return config;
});

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
