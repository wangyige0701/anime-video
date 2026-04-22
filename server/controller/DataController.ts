import type Koa from 'koa';
import { Context, Controller, Cross, HttpMethod, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { getDirectories, getSeriesInfos, refreshSeriesInfo, setDirectories } from '@server/src/videos';
import { isArray } from '@wang-yige/utils';

@Singleton()
@Controller(ServerRoot.DATA)
@Cross()
export class DataController {
	@HttpMethod.Get('/directories')
	public getDirectories(@Context() ctx: Koa.Context) {
		return ctx.Success(getDirectories());
	}

	@HttpMethod.Put('/directories')
	public setDirectories(@Context() ctx: Koa.Context) {
		const directories = ctx.request.body;
		if (isArray(directories)) {
			setDirectories(...(directories as string[]));
		}
		return ctx.Success();
	}

	@HttpMethod.Get('/series')
	public getSeriesInfos(@Context() ctx: Koa.Context) {
		return ctx.Success(getSeriesInfos());
	}

	@HttpMethod.Post('/series/refresh')
	public refreshSeriesInfo(@Context() ctx: Koa.Context) {
		refreshSeriesInfo();
		return ctx.Success();
	}
}
