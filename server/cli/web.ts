import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import config from '~shared/config-parser';
import { CSRF_META_NAME, CSRF_TOKEN_PLACEHOLDER } from '~shared/csrf';
import { injectCsrfHtml } from '~shared/csrf-secret';
import { createPromise } from '@wang-yige/utils';
import { runtimePath } from '~shared/runtime';
import { getDataDirectory } from '~server/src/utils/user-data-dir';
import { createShutdownHandler } from './shutdown';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

// logger 依赖全局配置，必须在注入配置后再加载，避免 ESM 静态导入提前求值。
const { closeLogger, createLogger } = await import('~server/middlewares/logger');

const WEB = __APP_CONFIG__.web;
const webPort = WEB.port;
const staticDir = runtimePath(import.meta.url, `../${WEB.webBundleDir}`);
let instance: { start: () => Promise<void>; stop: () => Promise<void>; restart: () => Promise<void> } | null = null;

export default function getInstance() {
	if (instance) {
		return instance;
	}

	const app = new Koa();
	const logger = createLogger({ component: 'web' });
	let lastServer: Server | null = null;

	app.on('error', (error, ctx) => {
		logger.error(
			{ source: 'error', event: 'web.request.failed', err: error, path: ctx?.path },
			'Web request failed',
		);
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

	app.use(historyApiFallback());

	const injectConfig = JSON.stringify(__APP_CONFIG__);
	/**
	 * 注入 CSRF 令牌。
	 *
	 * 令牌随 `index.html` 下发，不开接口：别的站点读不到这份文档，也就拿不到令牌。
	 * 模板只读一次并缓存，占位符按请求替换成新签发的令牌，因此进程长期不重启也不会
	 * 发出过期令牌。签发逻辑与 Vite 开发服务共用 `injectCsrfHtml()`。
	 */
	const dataDirectory = getDataDirectory();
	let templateHtml = '';
	// 注入全局配置与 CSRF 占位符到 index.html
	app.use(async (ctx, next) => {
		if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path === '/index.html') {
			ctx.type = 'html';
			ctx.set('Cache-Control', 'no-store');
			if (!templateHtml) {
				const html = await readFile(resolve(staticDir, 'index.html'), 'utf-8');
				const meta = `<meta name="${CSRF_META_NAME}" content="${CSRF_TOKEN_PLACEHOLDER}">`;
				templateHtml = html.replace(
					'</head>',
					`<script>window.__APP_CONFIG__=${injectConfig};</script>${meta}</head>`,
				);
			}
			ctx.body = injectCsrfHtml(templateHtml, dataDirectory);
			return;
		}
		await next();
	});

	app.use(server(staticDir));

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

	function start() {
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

	function stop() {
		const { promise, resolve, reject } = createPromise<void>();
		const server = lastServer;
		if (server) {
			// server.close() 会等待 keep-alive 连接结束；静态 Web 请求可能长期保持连接，
			// CLI worker 需要在停止时主动释放这些连接，保证 manager 能观察到进程退出。
			server.close((err) => {
				if (err) {
					reject(err);
					return;
				}
				lastServer = null;
				resolve();
			});
			server.closeIdleConnections();
			server.closeAllConnections();
		} else {
			resolve();
		}
		return promise;
	}

	async function restart() {
		await stop();
		await start();
	}

	instance = { start, stop, restart };
	return instance;
}
