export {};

import { DEV_WEB_PORT, getWebPort } from '@config/web';
import Koa from 'koa';
import { createProxyMiddleware } from 'http-proxy-middleware';
import connect from 'koa-connect';

const app = new Koa();

app.use(
	connect(
		createProxyMiddleware({
			target: `http://localhost:${DEV_WEB_PORT}`,
			changeOrigin: true,
			ws: true,
			logger: console,
		}),
	),
);

app.listen(getWebPort(), () => {
	console.log(`web server is running on http://localhost:${getWebPort()}`);
});
