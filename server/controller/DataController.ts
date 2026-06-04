import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { isArray } from '@wang-yige/utils';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class DataController {
	@HttpMethod.Get('/directories')
	public async getDirectories(@Context() ctx: Koa.Context) {
		return ctx.Success(Series.getDirectories());
	}

	@HttpMethod.Put('/directories')
	public async setDirectories(@Context() ctx: Koa.Context) {
		const directories = ctx.req.body;
		if (isArray(directories)) {
			await Series.setDirectories(...(directories as string[]));
			await Series.updateSeries();
		}
		return ctx.Success();
	}

	/**
	 * 获取所有视频系列信息，不包含视频季和视频集信息
	 */
	@HttpMethod.Get('/series')
	public async getSeries(@Context() ctx: Koa.Context) {
		const series = Promise.all((await Series.getAllSeries()).map((series) => series.getValueOmitSeasons()));
		return ctx.Success(await series);
	}

	/**
	 * 获取所有视频系列信息，包含视频季和视频集信息
	 */
	@HttpMethod.Get('/series/all')
	public async getAllSeries(@Context() ctx: Koa.Context) {
		const series = Promise.all((await Series.getAllSeries()).map((series) => series.getValue()));
		return ctx.Success(await series);
	}

	@HttpMethod.Post('/series/refresh')
	public async refreshSeries(@Context() ctx: Koa.Context) {
		await Series.updateSeries();
		return ctx.Success(await this.getAllSeries(ctx));
	}

	@HttpMethod.Get('/series/:seriesId')
	public async getDetailSeries(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const series = await Series.getSeriesById(seriesId);
		return ctx.Success(await series.getValue());
	}
}
