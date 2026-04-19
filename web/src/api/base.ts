import { AxiosRequest } from 'axios-useful';

export const API = new AxiosRequest('http://localhost:3000');

API.interceptors.response.use((response) => {
	return response.data;
});
