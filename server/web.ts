import config from '~shared/config-parser';
import { resolve, dirname } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import { fileURLToPath } from 'node:url';

export {};

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

// logger 依赖全局配置，必须在注入配置后再加载，避免 ESM 静态导入提前求值。
const { closeLogger, createLogger } = await import('~server/middlewares/logger');

const WEB = __APP_CONFIG__.web;
const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), WEB.webBundleDir);
const webPort = WEB.port;

const app = new Koa();
const logger = createLogger({ component: 'web' });

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

const httpServer = app.listen(webPort, () => {
	logger.info({ source: 'startup', host: WEB.host, port: webPort, staticDir }, 'Web server is listening');
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	logger.info({ source: 'shutdown', signal }, 'Web server shutdown started');
	// history fallback 和静态文件请求共享同一关闭流程。
	await Promise.race([
		new Promise<void>((resolve) => httpServer.close(() => resolve())),
		new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
	]);
	httpServer.closeAllConnections();
	try {
		await closeLogger();
	} catch (error) {
		process.stderr.write(`Failed to close logs: ${String(error)}\n`);
		process.exitCode = 1;
	} finally {
		process.exit();
	}
}

// Web 入口与 API 入口保持一致，确保开发和正式环境都能完成优雅退出。
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
