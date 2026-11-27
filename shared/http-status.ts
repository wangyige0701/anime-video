export enum Status {
	Success = 200,
	Failed = 400,
	Unauthorized = 401,
	Forbidden = 403,
	NotFound = 404,
	InternalServerError = 500,
	/** 上游服务不可用，例如第三方接口返回异常或无法连接 */
	BadGateway = 502,
	/** 本服务暂时不可用，例如缺少必要配置、依赖未就绪 */
	ServiceUnavailable = 503,
	/** 上游服务响应超时 */
	GatewayTimeout = 504,
}
