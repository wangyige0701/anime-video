/**
 * Bangumi 服务配置。
 *
 * 来源优先级：进程环境（`BANGUMI_*`）→ 仓库根 `.env`（含调试脚本沿用的 `BGM_*`）→ `config.yaml`。
 * 本地调试脚本历史上用 `BGM_` 前缀，这里一并接受，避免同一台机器维护两套变量。
 */
import type { AppConfig } from '~shared/config';
import { pickNumber, pickString, readEnvFile } from '../env';

export interface BangumiConfig {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
}

/** 从默认配置与 `.env` 合并 Bangumi 配置；纯函数便于测试，不读进程环境以外的全局状态 */
export function resolveBangumiConfig(defaults: AppConfig['bangumi'], dotenv: Record<string, string>): BangumiConfig {
	return {
		baseUrl: pickString(['BANGUMI_BASE_URL', 'BGM_BASE_URL'], dotenv, defaults.baseUrl),
		userAgent: pickString(['BANGUMI_USER_AGENT', 'BGM_USER_AGENT'], dotenv, defaults.userAgent),
		proxy: pickString(['BANGUMI_PROXY', 'BGM_PROXY'], dotenv, defaults.proxy),
		timeout: pickNumber(['BANGUMI_TIMEOUT'], dotenv, defaults.timeout),
	};
}

let cached: BangumiConfig | null = null;

export function getBangumiConfig(): BangumiConfig {
	if (!cached) {
		cached = resolveBangumiConfig(__APP_CONFIG__.bangumi, readEnvFile());
	}
	return cached;
}

/** 清空缓存，测试与配置热加载使用 */
export function clearBangumiConfigCache() {
	cached = null;
}
