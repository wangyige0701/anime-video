import type { Response } from '~types/response';
import { AxiosRequest } from 'axios-useful';
import { isBoolean, isNumber } from '@wang-yige/utils';

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
		console.log(error);
	},
);
