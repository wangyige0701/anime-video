import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Inject, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';

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
	@Validate((z) => z.object({ sort: z.number().int().min(1) }))
	public async updateEpisodeSort(@Context() ctx: Koa.Context, @Inject('episodeId') episodeId: string) {
		const { sort } = ctx.request.body as { sort: number };
		const episode = await Series.getEpisodeById(episodeId);
		await episode.updateSort(sort);
		await episode.waitDataSave();
		return ctx.Success();
	}

	@HttpMethod.Put('/episode/:episodeId/title')
	@Validate((z) => z.object({ title: z.string().min(1) }))
	public async updateEpisodeTitle(@Context() ctx: Koa.Context, @Inject('episodeId') episodeId: string) {
		const { title } = ctx.request.body as { title: string };
		const episode = await Series.getEpisodeById(episodeId);
		await episode.updateTitle(title);
		await episode.waitDataSave();
		return ctx.Success();
	}
}
