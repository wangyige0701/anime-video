import path from 'node:path';
import Koa from 'koa';
import Router from '@koa/router';
import body from 'koa-body';
import { Remux, getDuration } from '@remux/remux.node';

const app = new Koa();
const router = new Router();

router.get('/video/:path/info', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
});

router.get('/video/:path', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
});

router.get('/videos', async (ctx) => {});

app.use(body()).use(router.routes()).use(router.allowedMethods());

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
