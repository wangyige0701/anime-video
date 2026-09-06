import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-router';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '~shared/config-parser';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const SERVER = __APP_CONFIG__.server;

const [{ response }, { error }, { closeLogger, createLogger, logger, requestLog }] = await Promise.all([
	import('~server/middlewares/response'),
	import('~server/middlewares/error'),
	import('~server/middlewares/logger'),
]);

const dir = resolve(dirname(fileURLToPath(import.meta.url)), './controller');

const app = new Koa();
const decorator = new Decorator(dir);

app.use(requestLog())
	.use(error())
	.use(body())
	.use(response())
	.use(decorator.middleware())
	.use(decorator.allowedMethods());

const serverPort = SERVER.port;

const server = app.listen(serverPort, '0.0.0.0', () => {
	logger.info({ component: 'app', source: 'startup', port: serverPort }, 'Server is listening');
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
	if (shuttingDown) return;
	shuttingDown = true;
	const shutdownLogger = createLogger({ component: 'app', source: 'shutdown' });
	shutdownLogger.info({ signal }, 'Server shutdown started');

	// 先停止接收请求；SSE 等长连接最多等待 10 秒，避免进程无法退出。
	await Promise.race([
		new Promise<void>((resolve) => server.close(() => resolve())),
		new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
	]);
	server.closeAllConnections();

	try {
		await Promise.race([closeLogger(), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
	} finally {
		process.exitCode = 0;
		process.exit();
	}
}

// 显式处理容器和本地终止信号，避免默认退出路径跳过日志刷盘。
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
