import Koa from 'koa';
import Router from '@koa/router';
import body from 'koa-body';
import { response } from '@server/koa/response';
import { HlsManage } from './src/hls';

const app = new Koa();
const router = new Router();

router.get('/video/:path/index.m3u8', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);

	const m3u8 = HlsManage.getHlsManage(filepath).m3u8();

	ctx.set('Content-Type', 'application/vnd.apple.mpegurl');
	ctx.set('Cache-Control', 'no-cache');

	ctx.set('Access-Control-Allow-Origin', '*');
	ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

	ctx.body = m3u8;
});

router.get('/video/:path/:id.ts', async (ctx) => {
	const { path: requestPath, id: segmentId } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
	const segmentIndex = parseInt(segmentId, 10);

	const ts = await HlsManage.getHlsManage(filepath).ts(segmentIndex);

	ctx.set('Content-Type', 'video/mp2t');
	ctx.set('Cache-Control', 'public, max-age=3600');

	ctx.set('Access-Control-Allow-Origin', '*');
	ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

	ctx.body = ts;
});

router.get('/videos', async (ctx) => {});

app.use(body())
	.use(response())
	.use(router.routes())
	.use(router.allowedMethods());

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
