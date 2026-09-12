import type { Server } from 'node:http';
import { resolve, dirname } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import { fileURLToPath } from 'node:url';
import config from '~shared/config-parser';
import { createShutdownHandler } from './shutdown';
import { createPromise } from '@wang-yige/utils';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

// logger 依赖全局配置，必须在注入配置后再加载，避免 ESM 静态导入提前求值。
const { closeLogger, createLogger } = await import('~server/middlewares/logger');

const WEB = __APP_CONFIG__.web;
const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), WEB.webBundleDir);
const webPort = WEB.port;
const app = new Koa();
const logger = createLogger({ component: 'web' });
let lastServer: Server | null = null;

app.on('error', (error, ctx) => {
	logger.error({ source: 'error', event: 'web.request.failed', err: error, path: ctx?.path }, 'Web request failed');
});

app.use(async (ctx, next) => {
	// 静态资源成功请求数量大，只保留错误、异常方法和慢请求。
	const startedAt = performance.now();
	let failed = false;
	try {
		await next();
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		const durationMs = Math.round(performance.now() - startedAt);
		// 已由 Koa error 事件记录的异常不再输出第二条同内容的访问日志。
		if (!failed && (ctx.status >= 400 || !['GET', 'HEAD'].includes(ctx.method) || durationMs >= 1000)) {
			const level = ctx.status >= 500 ? 'error' : 'warn';
			logger[level](
				{
					source: ctx.status >= 500 ? 'error' : 'request',
					event: 'web.request.abnormal',
					method: ctx.method,
					path: ctx.path,
					status: ctx.status,
					durationMs,
				},
				'Abnormal web request',
			);
		}
	}
});

app.use(historyApiFallback()).use(server(staticDir));

createShutdownHandler(() => lastServer, {
	onBefore: async (signal) => {
		logger.info({ source: 'shutdown', signal }, 'Web server shutdown started');
	},
	onAfter: async () => {
		try {
			await closeLogger();
		} catch (error) {
			process.stderr.write(`Failed to close logs: ${String(error)}\n`);
			process.exitCode = 1;
		} finally {
			process.exit();
		}
	},
});

export function start() {
	if (lastServer) {
		throw new Error('Web Server is already running');
	}

	const { promise, resolve, reject } = createPromise<void>();
	const server = app.listen(webPort, () => {
		logger.info({ source: 'startup', host: WEB.host, port: webPort, staticDir }, 'Web server is listening');
		resolve();
	});
	lastServer = server;

	server.once('error', (error) => {
		if (lastServer === server) {
			lastServer = null;
		}
		logger.error({ source: 'error', event: 'web.server.error', err: error });
		reject(error);
	});

	return promise;
}

export function stop() {
	const { promise, resolve, reject } = createPromise<void>();
	const server = lastServer;
	if (server) {
		server.close((err) => {
			if (err) {
				reject(err);
				return;
			}
			lastServer = null;
			resolve();
		});
	} else {
		resolve();
	}
	return promise;
}

export async function restart() {
	await stop();
	await start();
}
