import { Status } from '~shared/http-status';
import type { SeriesMergeResult } from '~types/videos';
import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~shared/server-route-config';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import {
	seriesDateSchema,
	seriesDescriptionSchema,
	seriesStatusSchema,
	seriesTitleSchema,
} from '~server/src/schema/series-fields';
import { seriesMergeSchema } from '~server/src/schema/series-merge';
import { seriesTypes } from '~shared/series-types';
import { ApiError } from '~server/src/error';

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
		return ctx.Success(await this.getSeries(ctx));
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

	/**
	 * 把某个系列并入路径参数指定的主系列。
	 *
	 * 返回主系列与被并入系列的摘要：被并入系列可能自带成员（会一并转移），
	 * 前端需要据此同步两个实例的 `mergedIds`。
	 */
	@HttpMethod.Post('/series/:seriesId/merge')
	@Validate(() => seriesMergeSchema)
	public async mergeSeries(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { memberId } = ctx.request.body as { memberId: string };
		const { main, member } = await Series.mergeSeries(memberId, seriesId);
		ctx.log.info({ event: 'series.merged', seriesId, memberId }, 'Series merged');
		const result: SeriesMergeResult = {
			main: await main.getValueOmitSeasons(),
			member: await member.getValueOmitSeasons(),
		};
		return ctx.Success(result);
	}

	/**
	 * 让某个系列从主系列的合并组中脱离。
	 *
	 * 只返回主系列：成员系列自身没有反向引用需要修改。
	 */
	@HttpMethod.Delete('/series/:seriesId/merge/:memberId')
	public async detachSeries(
		@Context() ctx: Koa.Context,
		@Inject('seriesId') seriesId: string,
		@Inject('memberId') memberId: string,
	) {
		const main = await Series.detachSeries(seriesId, memberId);
		ctx.log.info({ event: 'series.detached', seriesId, memberId }, 'Series detached');
		const result: SeriesMergeResult = { main: await main.getValueOmitSeasons() };
		return ctx.Success(result);
	}

	@HttpMethod.Put('/series/:seriesId/title')
	@Validate(() => seriesTitleSchema)
	public async updateSeriesTitle(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { title } = ctx.request.body as { title: string };
		const series = await this.commitSeries(ctx, seriesId, (series) => series.updateTitle(title), {
			event: 'series.title.updated',
			message: 'Series title updated',
			details: { title },
		});
		// 空标题会被数据层还原为默认标题，返回写入后的实际标题供前端同步。
		return ctx.Success(await series.title);
	}

	@HttpMethod.Put('/series/:seriesId/description')
	@Validate(() => seriesDescriptionSchema)
	public async updateSeriesDescription(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { description } = ctx.request.body as { description: string };
		await this.commitSeries(ctx, seriesId, (series) => series.updateDescription(description), {
			event: 'series.description.updated',
			message: 'Series description updated',
		});
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/date')
	@Validate(() => seriesDateSchema)
	public async updateSeriesDate(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { year, month } = ctx.request.body as { year: number; month: number };
		await this.commitSeries(ctx, seriesId, (series) => series.updateDate(year, month), {
			event: 'series.date.updated',
			message: 'Series date updated',
			details: { year, month },
		});
		return ctx.Success();
	}

	@HttpMethod.Delete('/series/:seriesId/date')
	public async removeSeriesDate(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		await this.commitSeries(ctx, seriesId, (series) => series.removeDate(), {
			event: 'series.date.deleted',
			message: 'Series date deleted',
		});
		return ctx.Success();
	}

	@HttpMethod.Put('/series/:seriesId/status')
	@Validate(() => seriesStatusSchema)
	public async updateSeriesStatus(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { status } = ctx.request.body as { status: number };
		await this.commitSeries(ctx, seriesId, (series) => series.updateStatus(status), {
			event: 'series.status.updated',
			message: 'Series status updated',
			details: { status },
		});
		return ctx.Success();
	}

	@HttpMethod.Delete('/series/:seriesId/status')
	public async deleteSeriesStatus(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		await this.commitSeries(ctx, seriesId, (series) => series.updateStatus(0), {
			event: 'series.status.deleted',
			message: 'Series status deleted',
		});
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

	/**
	 * 字段写入的公共流程：取实体 → 写入 → 等待落盘 → 记日志。
	 *
	 * 六个字段端点原先各自重复这段流程，漏任何一步都会出现「接口已返回但未落盘」
	 * 或「改了却没有日志」。集中到一处后，字段处理器只描述写入动作与日志内容，
	 * 需要返回写入结果的端点（如标题）直接使用返回的实体实例。
	 */
	private async commitSeries(
		ctx: Koa.Context,
		seriesId: string,
		apply: (series: Series) => Promise<void>,
		log: { event: string; message: string; details?: Record<string, unknown> },
	) {
		const series = await Series.getSeriesById(seriesId);
		await apply(series);
		await series.waitDataSave();
		ctx.log.info({ event: log.event, seriesId, ...log.details }, log.message);
		return series;
	}
}

function validateOperation(param: string) {
	if (!['add', 'remove', 'set'].includes(param)) {
		throw new ApiError(Status.Failed, 'operation 参数必须是 add, remove, 或 set');
	}
	return param;
}
