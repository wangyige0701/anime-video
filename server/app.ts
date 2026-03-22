import Koa from 'koa';
import body from 'koa-body';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { response } from '@server/koa/response';
import { decorators } from '@server/koa/decorators';

const app = new Koa();

app.use(body())
	.use(response())
	.use(
		decorators({
			absoluteDir: resolve(dirname(fileURLToPath(import.meta.url)), './controller'),
			allowedMethods: true,
		}),
	);

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
