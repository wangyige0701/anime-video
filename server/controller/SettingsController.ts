import { isUndefined } from '@wang-yige/utils';
import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Singleton } from 'koa-use-decorator-router';
import { ServerRoot } from '~shared/server-route-config';
import { Validate } from '~server/decorators/validate';
import { settingsUpdateSchema } from '~server/src/schema/settings';
import { probeAi as probeAiEndpoint, probeBangumi as probeBangumiEndpoint } from '~server/src/settings/probe';
import { readSettings, toSettingsView, updateSettings } from '~server/src/settings/store';
import type { SettingsPatch } from '~server/src/settings/store';

/**
 * 用户设置（AI 与 Bangumi 凭据）。
 *
 * 这里的值来自用户自己，不随仓库分发；接口只回显脱敏视图，明文密钥不出服务端。
 * 保存后立即生效：读取方每次从设置存储取值，没有需要手动失效的进程缓存。
 */
@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class SettingsController {
	@HttpMethod.Get('/settings')
	public async getSettings(@Context() ctx: Koa.Context) {
		return ctx.Success(toSettingsView(await readSettings()));
	}

	@HttpMethod.Put('/settings')
	@Validate(() => settingsUpdateSchema)
	public async saveSettings(@Context() ctx: Koa.Context) {
		const patch = ctx.request.body as SettingsPatch;
		const settings = await updateSettings(patch);
		// 只记录改动了哪些字段，任何字段值（尤其是密钥）都不进日志
		ctx.log.info({ event: 'settings.updated', fields: changedFields(patch) }, 'User settings updated');
		return ctx.Success(toSettingsView(settings));
	}

	@HttpMethod.Post('/settings/ai/probe')
	public async probeAi(@Context() ctx: Koa.Context) {
		const result = await probeAiEndpoint();
		ctx.log.info({ event: 'settings.ai.probed', latencyMs: result.latencyMs }, 'AI endpoint probed');
		return ctx.Success(result);
	}

	@HttpMethod.Post('/settings/bangumi/probe')
	public async probeBangumi(@Context() ctx: Koa.Context) {
		const result = await probeBangumiEndpoint();
		ctx.log.info({ event: 'settings.bangumi.probed', latencyMs: result.latencyMs }, 'Bangumi endpoint probed');
		return ctx.Success(result);
	}
}

function changedFields(patch: SettingsPatch) {
	return Object.entries(patch).flatMap(([section, values]) =>
		Object.entries(values ?? {})
			.filter(([, value]) => !isUndefined(value))
			.map(([key]) => `${section}.${key}`),
	);
}
