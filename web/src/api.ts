import type { Response } from '~types/response';
import { AxiosRequest, axios } from 'axios-useful';
import { isBoolean, isNumber, isObject, isString } from '@wang-yige/utils';
import { ElMessage } from 'element-plus';

export const API = new AxiosRequest('http://localhost:3000');

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
		if (error instanceof axios.CanceledError) {
			throw error;
		}
		if (error instanceof Error) {
			ElMessage.error(error.message);
			throw error;
		}
		const data = error.response?.data as Response<any>;
		if (isString(data.message)) {
			ElMessage.error(data.message);
			throw error;
		}
		ElMessage.error('请求失败，请稍后重试');
		throw error;
	},
);
