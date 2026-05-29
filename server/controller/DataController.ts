import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { getDirectories, getSeriesInfos, refreshSeriesInfo, setDirectories } from '~server/src/videos';
import { isArray } from '@wang-yige/utils';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class DataController {
	@HttpMethod.Get('/directories')
	public async getDirectories(@Context() ctx: Koa.Context) {
		return ctx.Success(await getDirectories());
	}

	@HttpMethod.Put('/directories')
	public async setDirectories(@Context() ctx: Koa.Context) {
		const directories = ctx.request.body;
		if (isArray(directories)) {
			await setDirectories(...(directories as string[]));
		}
		return ctx.Success();
	}

	@HttpMethod.Get('/series')
	public async getSeriesInfos(@Context() ctx: Koa.Context) {
		return ctx.Success(await getSeriesInfos());
	}

	@HttpMethod.Post('/series/refresh')
	public async refreshSeriesInfo(@Context() ctx: Koa.Context) {
		await refreshSeriesInfo();
		return ctx.Success();
	}
}
