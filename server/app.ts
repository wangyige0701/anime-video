import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-router';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '~shared/config-parser';
import { createShutdownHandler } from './shutdown';

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

createShutdownHandler(server, {
	onBefore: async (signal) => {
		const shutdownLogger = createLogger({ component: 'app', source: 'shutdown' });
		shutdownLogger.info({ signal }, 'App server shutdown started');
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
