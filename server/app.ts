import Koa from 'koa';
import body from 'koa-body';
import Decorator from 'koa-use-decorator-route';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { response } from '@server/koa/response';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), './controller');

const app = new Koa();
const decorator = new Decorator(dir);

app.use(body()).use(response()).use(decorator.middleware()).use(decorator.allowedMethods());

app.listen(3000, () => {
	console.log('server is running on http://localhost:3000');
});
