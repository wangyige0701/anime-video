import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Singleton } from 'koa-use-decorator-router';
import { isArray } from '@wang-yige/utils';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class DataController {
	@HttpMethod.Get('/directories')
	public async getDirectories(@Context() ctx: Koa.Context) {
		return ctx.Success(Series.getDirectories());
	}

	@HttpMethod.Put('/directories')
	@Validate((z) => z.array(z.string()))
	public async setDirectories(@Context() ctx: Koa.Context) {
		const directories = ctx.request.body;
		if (isArray(directories)) {
			await Series.setDirectories(...(directories as string[]));
			await Series.updateSeries();
		}
		return ctx.Success();
	}
}
