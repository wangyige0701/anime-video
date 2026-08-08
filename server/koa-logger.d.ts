/// <reference types="koa" />

import type { Logger } from 'pino';

export {};

declare module 'koa' {
	/** Koa 请求生命周期内可用的日志实例。 */
	interface DefaultContext {
		log: Logger;
	}
}
