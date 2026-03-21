import Koa from 'koa';
import Router from '@koa/router';
import body from 'koa-body';
import { response } from '@server/koa/response';
import { HlsManage } from './src/hls';

const app = new Koa();
const router = new Router();

function cross(ctx: Koa.Context) {
	ctx.set('Access-Control-Allow-Origin', '*');
	ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

// 主播放列表
router.get('/video/:path/master.m3u8', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);

	const master = HlsManage.getHlsManage(filepath).master();

	ctx.set('Content-Type', 'application/vnd.apple.mpegurl');
	ctx.set('Cache-Control', 'no-cache');

	cross(ctx);

	ctx.body = master;
});

router.get('/video/:path/index.m3u8', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);

	const m3u8 = HlsManage.getHlsManage(filepath).m3u8();

	ctx.set('Content-Type', 'application/vnd.apple.mpegurl');
	ctx.set('Cache-Control', 'no-cache');

	cross(ctx);

	ctx.body = m3u8;
});

router.get('/video/:path/:id.ts', async (ctx) => {
	const { path: requestPath, id: segmentId } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
	const segmentIndex = parseInt(segmentId, 10);

	const ts = await HlsManage.getHlsManage(filepath).ts(segmentIndex);

	ctx.set('Content-Type', 'video/mp2t');
	ctx.set('Cache-Control', 'public, max-age=3600');

	cross(ctx);

	ctx.body = ts;
});

router.get('/video/:path/:streamIndex.m3u8', async (ctx) => {
	const { path: requestPath, streamIndex: streamIndex } = ctx.params;
	const filepath = decodeURIComponent(requestPath);

	const subtitle_m3u8 = HlsManage.getHlsManage(filepath).subtitle_m3u8(parseInt(streamIndex, 10));

	ctx.set('Content-Type', 'application/vnd.apple.mpegurl');
	ctx.set('Cache-Control', 'no-cache');

	cross(ctx);

	ctx.body = subtitle_m3u8;
});

router.get('/video/:path/:streamIndex/:id.vtt', async (ctx) => {
	const { path: requestPath, streamIndex: streamIndex, id: segmentId } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
	const segmentIndex = parseInt(segmentId, 10);

	const subtitle = HlsManage.getHlsManage(filepath).subtitle(parseInt(streamIndex, 10), segmentIndex);

	ctx.set('Content-Type', 'text/vtt');
	ctx.set('Cache-Control', 'public, max-age=3600');

	cross(ctx);

	ctx.body = subtitle;
});

router.get('/videos', async (ctx) => {});

app.use(body()).use(response()).use(router.routes()).use(router.allowedMethods());

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
