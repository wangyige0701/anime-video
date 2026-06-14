import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { seriesStatus } from '~config/seriesStatus';
import { seriesTypes } from '~config/seriesTypes';

const minSeriesStatus = seriesStatus[0].id;
const maxSeriesStatus = seriesStatus[seriesStatus.length - 1].id;
const minSeriesType = seriesTypes[0].id;
const maxSeriesType = seriesTypes[seriesTypes.length - 1].id;

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class SeriesController {
	/**
	 * 获取所有视频系列信息，不包含视频季和视频集信息
	 */
	@HttpMethod.Get('/series')
	public async getSeries(@Context() ctx: Koa.Context) {
		const series = Promise.all((await Series.getAllSeries()).map((series) => series.getValueOmitSeasons()));
		return ctx.Success(await series);
	}

	@HttpMethod.Post('/series/refresh')
	public async refreshSeries(@Context() ctx: Koa.Context) {
		await Series.updateSeries();
		return ctx.Success(await this.getSeries(ctx));
	}

	@HttpMethod.Get('/series/:seriesId')
	public async getSeriesDetail(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const series = await Series.getSeriesById(seriesId);
		return ctx.Success(await series.getValue());
	}

	@HttpMethod.Put('/series/:seriesId/title')
	@Validate((z) => z.object({ title: z.string().min(1) }))
	public async updateSeriesTitle(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { title } = ctx.request.body as { title: string };
		const series = await Series.getSeriesById(seriesId);
		await series.updateTitle(title);
		await series.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/description')
	@Validate((z) => z.object({ description: z.string().min(0) }))
	public async updateSeriesDescription(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { description } = ctx.request.body as { description: string };
		const series = await Series.getSeriesById(seriesId);
		await series.updateDescription(description);
		await series.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/date')
	@Validate((z) => z.object({ year: z.number().int().min(1900), month: z.number().int().min(1).max(12) }))
	public async updateSeriesDate(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { year, month } = ctx.request.body as { year: number; month: number };
		const series = await Series.getSeriesById(seriesId);
		await series.updateDate(year, month);
		await series.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/status')
	@Validate((z) =>
		z.object({
			status: z.number().int().min(minSeriesStatus).max(maxSeriesStatus),
		}),
	)
	public async updateSeriesStatus(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { status } = ctx.request.body as { status: number };
		const series = await Series.getSeriesById(seriesId);
		await series.updateStatus(status);
		await series.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/types/:operation(add|remove|set)')
	@Validate((z) => z.object({ types: z.array(z.number().int().min(minSeriesType).max(maxSeriesType)) }))
	public async updateSeriesTypes(
		@Context() ctx: Koa.Context,
		@Inject('seriesId') seriesId: string,
		@Inject('operation') operation: 'add' | 'remove' | 'set',
	) {
		const { types } = ctx.request.body as { types: number[] };
		const series = await Series.getSeriesById(seriesId);
		if (operation === 'add') {
			await series.addTypes(types);
		} else if (operation === 'remove') {
			await series.removeTypes(types);
		} else if (operation === 'set') {
			await series.updateTypes(types);
		}
		await series.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/images/:operation(add|remove|set)')
	@Validate((z) => z.object({ images: z.array(z.string().min(1)) }))
	public async updateSeriesImages(
		@Context() ctx: Koa.Context,
		@Inject('seriesId') seriesId: string,
		@Inject('operation') operation: 'add' | 'remove' | 'set',
	) {
		const { images } = ctx.request.body as { images: string[] };
		const series = await Series.getSeriesById(seriesId);
		if (operation === 'add') {
			await series.addImages(images);
		} else if (operation === 'remove') {
			await series.removeImages(images);
		} else if (operation === 'set') {
			await series.updateImages(images);
		}
		await series.waitDataSave();
		return ctx.Success();
	}
}
