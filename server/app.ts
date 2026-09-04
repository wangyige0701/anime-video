import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-router';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '~shared/config-parser';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const SERVER = __APP_CONFIG__.server;

const [{ response }, { error }, { logger, requestLog }] = await Promise.all([
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

app.listen(serverPort, '0.0.0.0', () => {
	logger.info({ port: serverPort }, 'Server is listening');
});
