/**
 * Bangumi 服务配置。
 *
 * 来源只有用户设置（`src/settings/store.ts`）。早期版本支持 `BANGUMI_*` / `BGM_*` 环境变量与
 * 仓库根 `.env`，现在统一由设置页维护；旧值可用 `scripts/migrate-env.mjs` 一次性迁移。
 * 不要在运行时再加环境变量回退，否则「设置页填了却没生效」会变成难以解释的现象。
 */
import { DEFAULT_SETTINGS, readSettings } from '~server/src/settings/store';
import type { BangumiSettings } from '~server/src/settings/store';

export interface BangumiConfig {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
}

/** 纯函数：把用户设置归一化成请求参数，便于直接以普通对象测试 */
export function resolveBangumiConfig(settings: BangumiSettings): BangumiConfig {
	return {
		baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''),
		// Bangumi 会拒绝默认 UA；手改 settings.json 把 UA 清空时回退到内置标识，而不是发出必然被拒的请求
		userAgent: settings.userAgent.trim() || DEFAULT_SETTINGS.bangumi.userAgent,
		proxy: settings.proxy.trim(),
		timeout: normalizeTimeout(settings.timeout, DEFAULT_SETTINGS.bangumi.timeout),
	};
}

/** 读取当前生效的 Bangumi 配置；设置更新后下一次调用即可拿到新值 */
export async function getBangumiConfig(): Promise<BangumiConfig> {
	return resolveBangumiConfig((await readSettings()).bangumi);
}

/** 手改 `settings.json` 可能写出 0、负数或非数字，统一回退默认值，避免请求一发出就超时 */
function normalizeTimeout(value: number, fallback: number) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
