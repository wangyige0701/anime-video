export interface Response<T = any> {
	code: number;
	data: T;
	success: boolean;
	message: string;
	timestamp: number;
}
