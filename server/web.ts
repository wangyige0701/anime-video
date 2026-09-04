import config from '~shared/config-parser';
import { resolve, dirname } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import { fileURLToPath } from 'node:url';

export {};

// @ts-expect-error
globalThis.__APP_CONFIG__ = config;

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), __APP_CONFIG__.web.webBundleDir);
const webPort = isWebPortDefined() ? Number(process.env.WEB_PORT) : __APP_CONFIG__.web.port;

const app = new Koa();

app.use(historyApiFallback()).use(server(staticDir));

app.listen(webPort, () => {
	console.log(`web server is running on ${__APP_CONFIG__.web.protocol}://${__APP_CONFIG__.web.host}:${webPort}`);
});

function isWebPortDefined() {
	return process.env.WEB_PORT !== undefined && !isNaN(Number(process.env.WEB_PORT));
}
