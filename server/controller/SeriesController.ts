import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { seriesStatus } from '~config/seriesStatus';
import { seriesTypes } from '~config/seriesTypes';
import { ApiError } from '~server/src/error';

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
		ctx.log.info({ event: 'series.refreshed', scope: 'all' }, 'All series refreshed');
		return ctx.Success();
	}

	@HttpMethod.Post('/series/refresh/:seriesId')
	public async refreshSeriesById(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		// 先确认目标存在，避免不存在的 ID 被刷新接口静默视为成功。
		await Series.getSeriesById(seriesId);
		await Series.updateSeries(seriesId);
		ctx.log.info({ event: 'series.refreshed', scope: 'single', seriesId }, 'Series refreshed');
		return ctx.Success();
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
		ctx.log.info({ event: 'series.title.updated', seriesId }, 'Series title updated');
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/description')
	@Validate((z) => z.object({ description: z.string().min(0) }))
	public async updateSeriesDescription(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { description } = ctx.request.body as { description: string };
		const series = await Series.getSeriesById(seriesId);
		await series.updateDescription(description);
		await series.waitDataSave();
		ctx.log.info({ event: 'series.description.updated', seriesId }, 'Series description updated');
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/date')
	@Validate((z) => z.object({ year: z.number().int().min(1900), month: z.number().int().min(1).max(12) }))
	public async updateSeriesDate(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { year, month } = ctx.request.body as { year: number; month: number };
		const series = await Series.getSeriesById(seriesId);
		await series.updateDate(year, month);
		await series.waitDataSave();
		ctx.log.info({ event: 'series.date.updated', seriesId, year, month }, 'Series date updated');
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
		ctx.log.info({ event: 'series.status.updated', seriesId, status }, 'Series status updated');
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/types/:operation')
	@Validate((z) => z.object({ types: z.array(z.number().int().min(minSeriesType).max(maxSeriesType)) }))
	public async updateSeriesTypes(
		@Context() ctx: Koa.Context,
		@Inject('seriesId') seriesId: string,
		@Inject('operation', validateOperation) operation: 'add' | 'remove' | 'set',
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
		ctx.log.info(
			{ event: 'series.types.updated', seriesId, operation, count: types.length },
			'Series types updated',
		);
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/images/:operation')
	@Validate((z) => z.object({ images: z.array(z.string().min(1)) }))
	public async updateSeriesImages(
		@Context() ctx: Koa.Context,
		@Inject('seriesId') seriesId: string,
		@Inject('operation', validateOperation) operation: 'add' | 'remove' | 'set',
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
		ctx.log.info(
			{ event: 'series.images.updated', seriesId, operation, count: images.length },
			'Series images updated',
		);
		return ctx.Success();
	}
}

function validateOperation(param: string) {
	if (!['add', 'remove', 'set'].includes(param)) {
		throw new ApiError(400, 'operation 参数必须是 add, remove, 或 set');
	}
	return param;
}
