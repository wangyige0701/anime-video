import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-router';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { response } from '~server/middlewares/response';
import { error } from '~server/middlewares/error';
import { logger, requestLog } from '~server/middlewares/logger';
import { getServerPort } from '~config/server';
import config from '~shared/config-parser';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const dir = resolve(dirname(fileURLToPath(import.meta.url)), './controller');

const app = new Koa();
const decorator = new Decorator(dir);

app.use(requestLog())
	.use(error())
	.use(body())
	.use(response())
	.use(decorator.middleware())
	.use(decorator.allowedMethods());

app.listen(getServerPort(), '0.0.0.0', () => {
	logger.info({ port: getServerPort() }, 'Server is listening');
});
