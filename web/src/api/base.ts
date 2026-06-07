import type { Response } from '~types/response';
import { AxiosRequest } from 'axios-useful';

export const API = new AxiosRequest('http://localhost:3000');

API.interceptors.response.use(
	(response) => {
		const data = response.data as Response<any>;
		if (data.success) {
			return data as any;
		}
		throw new Error(data.message);
	},
	(error) => {
		console.log(error);
	},
);
