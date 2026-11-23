import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~shared/server-route-config';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { episodeSortSchema, episodeTitleSchema } from '~server/src/schema/episode-fields';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class EpisodeController {
	@HttpMethod.Get('/episodes/:seasonId')
	public async getEpisodesBySeasonId(@Context() ctx: Koa.Context, @Inject('seasonId') seasonId: string) {
		const seasons = await Series.getSeasonById(seasonId);
		const episodes = await Promise.all((await seasons.episodes).map((episode) => episode.getValue()));
		return ctx.Success(episodes);
	}

	@HttpMethod.Get('/episode/:episodeId')
	public async getEpisodeById(@Context() ctx: Koa.Context, @Inject('episodeId') episodeId: string) {
		const episode = await Series.getEpisodeById(episodeId);
		return ctx.Success(episode.getValue());
	}

	@HttpMethod.Put('/episode/:episodeId/sort')
	@Validate(() => episodeSortSchema)
	public async updateEpisodeSort(@Context() ctx: Koa.Context, @Inject('episodeId') episodeId: string) {
		const { sort } = ctx.request.body as { sort: number };
		const episode = await Series.getEpisodeById(episodeId);
		await episode.updateSort(sort);
		await episode.waitDataSave();
		ctx.log.info({ event: 'episode.sort.updated', episodeId, sort }, 'Episode sort updated');
		return ctx.Success();
	}

	@HttpMethod.Put('/episode/:episodeId/title')
	@Validate(() => episodeTitleSchema)
	public async updateEpisodeTitle(@Context() ctx: Koa.Context, @Inject('episodeId') episodeId: string) {
		const { title } = ctx.request.body as { title: string };
		const episode = await Series.getEpisodeById(episodeId);
		await episode.updateTitle(title);
		await episode.waitDataSave();
		ctx.log.info({ event: 'episode.title.updated', episodeId, title }, 'Episode title updated');
		// 空标题会被数据层还原为默认标题，返回实际标题供前端同步。
		return ctx.Success(await episode.title);
	}
}
