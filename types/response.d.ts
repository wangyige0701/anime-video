export interface Response<T = any> {
	code: number;
	data: ResponseData<T>;
	success: boolean;
	message: string;
	timestamp: number;
}

type ResponseData<T> = T extends Response<infer U> ? U : T;
