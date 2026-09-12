import type { Server } from 'node:http';
import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-router';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPromise } from '@wang-yige/utils';
import config from '~shared/config-parser';
import { createShutdownHandler } from './shutdown';

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const [{ response }, { error }, { closeLogger, createLogger, logger, requestLog }] = await Promise.all([
	import('~server/middlewares/response'),
	import('~server/middlewares/error'),
	import('~server/middlewares/logger'),
]);

const SERVER = __APP_CONFIG__.server;
const dir = resolve(dirname(fileURLToPath(import.meta.url)), './controller');
const serverPort = SERVER.port;
const app = new Koa();
const decorator = new Decorator(dir);
let lastServer: Server | null = null;

app.use(requestLog())
	.use(error())
	.use(body())
	.use(response())
	.use(decorator.middleware())
	.use(decorator.allowedMethods());

createShutdownHandler(() => lastServer, {
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

export function start() {
	if (lastServer) {
		throw new Error('Server is already running');
	}

	const { promise, resolve, reject } = createPromise<void>();
	const server = app.listen(serverPort, '0.0.0.0', () => {
		logger.info({ component: 'app', source: 'startup', port: serverPort }, 'Server is listening');
		resolve();
	});
	lastServer = server;

	server.once('error', (err) => {
		if (lastServer === server) {
			lastServer = null;
		}
		logger.error({ component: 'app', source: 'startup', error: err }, 'Server error');
		reject(err);
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
