import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~shared/server-route-config';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { bangumiApplySchema, bangumiPreviewSchema } from '~server/src/schema/bangumi-sync';
import { applyChangeSet, runMatch, runPreview } from '~server/src/integrations/bangumi/sync';
import type { ApplyInput, LocalSeasonInput, SeasonMappingInput } from '~server/src/integrations/bangumi/sync';

/**
 * Bangumi 数据同步。
 *
 * 三段式接口，前两段只读、最后一段才写库，保证「抓取 → 预览 → 确认保存」的流程
 * 不会因为中途失败留下半套数据：
 * - `match`：搜索并给出季与条目的建议，人工可改；
 * - `preview`：按确认后的映射生成 changeSet，人工可勾选；
 * - `apply`：校验后写入。
 *
 * 系列标题、描述、日期、状态直接读接口；季/集顺序、集标题与类型标签才需要整合。
 */
@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class BangumiController {
	@HttpMethod.Post('/series/:seriesId/bangumi/match')
	public async match(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const series = await Series.getSeriesById(seriesId);
		const [seriesName, seriesTitle, seasons] = await Promise.all([
			series.getSeriesName(),
			series.title,
			this.localSeasons(series),
		]);
		const result = await runMatch(seriesName, seriesTitle, seasons);
		ctx.log.info(
			{
				event: 'series.bangumi.matched',
				seriesId,
				seasons: seasons.length,
				candidates: result.candidates.length,
			},
			'Bangumi match finished',
		);
		return ctx.Success({ ...result, seriesId });
	}

	@HttpMethod.Post('/series/:seriesId/bangumi/preview')
	@Validate(() => bangumiPreviewSchema)
	public async preview(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const { seasons: mapping } = ctx.request.body as unknown as { seasons: SeasonMappingInput[] };
		const series = await Series.getSeriesById(seriesId);
		const seasons = await this.localSeasons(series);
		const result = await runPreview(mapping, seasons);
		ctx.log.info(
			{ event: 'series.bangumi.previewed', seriesId, seasons: result.seasons.length },
			'Bangumi preview generated',
		);
		return ctx.Success({ ...result, seriesId });
	}

	@HttpMethod.Post('/series/:seriesId/bangumi/apply')
	@Validate(() => bangumiApplySchema)
	public async apply(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const input = ctx.request.body as ApplyInput;
		const series = await Series.getSeriesById(seriesId);
		const applied = await applyChangeSet(series, input);
		ctx.log.info(
			{
				event: 'series.bangumi.applied',
				seriesId,
				fields: applied.series,
				seasons: applied.seasons.length,
				episodes: applied.seasons.reduce((total, item) => total + item.episodes, 0),
			},
			'Bangumi data applied',
		);
		return ctx.Success(applied);
	}

	/**
	 * 读取本地季与集。
	 *
	 * 只提供 id 与文件名：顺序、分类都在整合层按文件名推导，
	 * 数据层不参与任何「哪一集是第几集」的判断。
	 */
	private async localSeasons(series: Series): Promise<LocalSeasonInput[]> {
		const result: LocalSeasonInput[] = [];
		for (const season of await series.seasons) {
			const episodes = await season.episodes;
			result.push({
				seasonId: await season.id,
				path: season.getSeasonName(),
				title: await season.title,
				episodes: await Promise.all(
					episodes.map(async (episode) => ({ id: await episode.id, fileName: episode.getEpisodeName() })),
				),
			});
		}
		return result;
	}
}
