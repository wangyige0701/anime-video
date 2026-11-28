import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~shared/server-route-config';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { bangumiApplySchema, bangumiPreviewSchema } from '~server/src/schema/bangumi-sync';
import { applyChangeSet, readLocalSeasons, runMatch, runPreview } from '~server/src/integrations/bangumi/sync';
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
 * **同步范围与详情页一致：主系列 + 被合并的成员系列。** 季可能来自其中任何一个，
 * 只处理主系列会让成员的季永远拿不到 Bangumi 的标题与排序。
 *
 * 系列标题、描述、日期、状态直接读接口；季/集顺序、集标题与类型标签才需要整合。
 */
@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class BangumiController {
	@HttpMethod.Post('/series/:seriesId/bangumi/match')
	public async match(@Context() ctx: Koa.Context, @Inject('seriesId') seriesId: string) {
		const group = await this.mergeGroup(await Series.getSeriesById(seriesId));
		const series = group[0]!;
		const [seriesName, seriesTitle, seasons, memberTitles] = await Promise.all([
			series.getSeriesName(),
			series.title,
			readLocalSeasons(group),
			Promise.all(group.slice(1).map((member) => member.title)),
		]);
		const result = await runMatch(seriesName, seriesTitle, seasons, memberTitles);
		ctx.log.info(
			{
				event: 'series.bangumi.matched',
				seriesId,
				members: memberTitles.length,
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
		const group = await this.mergeGroup(await Series.getSeriesById(seriesId));
		const seasons = await readLocalSeasons(group);
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
		const group = await this.mergeGroup(await Series.getSeriesById(seriesId));
		const applied = await applyChangeSet(group, input);
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
	 * 主系列与被合并的成员系列，主系列在首位。
	 *
	 * 悬空 id（成员已被删除）直接跳过：数据层的规范化会在下次扫描清理，
	 * 这里不该让一条失效引用把整个同步流程拦下来。
	 */
	private async mergeGroup(series: Series): Promise<Series[]> {
		const ids = await series.mergedIds;
		if (!ids.length) {
			return [series];
		}
		const members = await Promise.all(
			ids.map(async (id) => {
				try {
					return await Series.getSeriesById(id);
				} catch {
					return null;
				}
			}),
		);
		return [series, ...members.filter((item): item is Series => !!item)];
	}
}
