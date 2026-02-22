import Koa from 'koa';
import Router from '@koa/router';
import body from 'koa-body';
import { Remux, getDuration } from '@remux/remux.node';
import { response } from '@server/koa/response';

const app = new Koa();
const router = new Router();

router.get('/video/:path/info', async (ctx) => {
	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);

	ctx.set('Access-Control-Allow-Origin', '*');
	ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

	ctx.Success(getDuration(filepath));
});

router.get('/video/:path', async (ctx) => {
	ctx.respond = false; // 让 Koa 不处理响应，直接使用原生 Node.js 的响应对象
	ctx.status = 200;

	const { path: requestPath } = ctx.params;
	const filepath = decodeURIComponent(requestPath);
	const seek = Number(ctx.query.time || 0) || 0;

	const remux = new Remux({
		path: filepath,
		seek,
		write(data) {
			ctx.res.write(data);
		},
		end() {
			ctx.res.end();
		},
		error(e) {
			console.error(e);
		},
	});

	ctx.req.on('close', () => {
		try {
			remux.stop();
		} catch (error) {}
	});

	console.log(`Start streaming ${filepath} from ${seek}s`);
	remux.start();
});

router.get('/videos', async (ctx) => {});

app.use(body())
	.use(response())
	.use(router.routes())
	.use(router.allowedMethods());

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
