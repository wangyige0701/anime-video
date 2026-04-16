export {};

import { resolve, dirname } from 'node:path';
import Koa from 'koa';
import server from 'koa-static';
import { historyApiFallback } from 'koa2-connect-history-api-fallback';
import { getWebPort, WEB_BUNDLE_DIR } from '@config/web';
import { fileURLToPath } from 'node:url';

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), WEB_BUNDLE_DIR);

const app = new Koa();

app.use(historyApiFallback()).use(server(staticDir));

app.listen(getWebPort(), () => {
	console.log(`web server is running on http://localhost:${getWebPort()}`);
});
