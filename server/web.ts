import config from '~shared/config-parser';
import { resolve, dirname } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import { fileURLToPath } from 'node:url';

export {};

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const WEB = __APP_CONFIG__.web;
const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), WEB.webBundleDir);
const webPort = WEB.port;

const app = new Koa();

app.use(historyApiFallback()).use(server(staticDir));

app.listen(webPort, () => {
	console.log(`web server is running on ${WEB.protocol}://${WEB.host}:${webPort}`);
});
