import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class SeasonController {
	@HttpMethod.Get('/seasons/:seriesId')
	public async getSeasonsBySeriesId(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const series = await Series.getSeriesById(seriesId);
		const seasons = await Promise.all((await series.seasons).map((season) => season.getValue()));
		return ctx.Success(seasons);
	}

	@HttpMethod.Get('/season/:seasonId')
	public async getSeasonById(@Context() ctx: Koa.Context, @Inject('seasonId') seasonId: string) {
		const season = await Series.getSeasonById(seasonId);
		return ctx.Success(season.getValue());
	}

	@HttpMethod.Put('/season/:seasonId/sort')
	@Validate((z) => z.object({ sort: z.number().min(1) }))
	public async updateSeasonSort(@Context() ctx: Koa.Context, @Inject('seasonId') seasonId: string) {
		const { sort } = ctx.request.body as { sort: number };
		const season = await Series.getSeasonById(seasonId);
		await season.updateSort(sort);
		await season.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/season/:seasonId')
	@Validate((z) => z.object({ title: z.string().min(1) }))
	public async updateSeasonTitle(@Context() ctx: Koa.Context, @Inject('seasonId') seasonId: string) {
		const { title } = ctx.request.body as { title: string };
		const season = await Series.getSeasonById(seasonId);
		await season.updateTitle(title);
		await season.waitDataSave();
		return ctx.Success();
	}
}
