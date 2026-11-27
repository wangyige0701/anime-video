/**
 * AI 服务配置（OpenAI 兼容接口）。
 *
 * 与 Bangumi 配置完全独立：两边的代理、超时、密钥互不继承。
 * 有些模型服务本身不需要走代理，复用 Bangumi 的代理只会让请求绕一圈再失败。
 */
import type { AppConfig } from '~shared/config';
import { pickNumber, pickString, readEnvFile } from '../env';

export interface AiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	proxy: string;
	timeout: number;
}

export function resolveAiConfig(defaults: AppConfig['ai'], dotenv: Record<string, string>): AiConfig {
	return {
		baseUrl: pickString(['AI_BASE_URL'], dotenv, defaults.baseUrl),
		apiKey: pickString(['AI_API_KEY'], dotenv, defaults.apiKey),
		model: pickString(['AI_MODEL'], dotenv, defaults.model),
		proxy: pickString(['AI_PROXY'], dotenv, defaults.proxy),
		timeout: pickNumber(['AI_TIMEOUT'], dotenv, defaults.timeout),
	};
}

let cached: AiConfig | null = null;

export function getAiConfig(): AiConfig {
	if (!cached) {
		cached = resolveAiConfig(__APP_CONFIG__.ai, readEnvFile());
	}
	return cached;
}

export function clearAiConfigCache() {
	cached = null;
}

/**
 * AI 是否已配置完整。
 *
 * 缺任一项时同步接口直接返回明确错误，而不是发出一个必然失败的请求 ——
 * 也避免把「没有密钥」误报成「模型返回格式错误」。
 */
export function isAiConfigured(config: AiConfig = getAiConfig()) {
	return Boolean(config.baseUrl && config.apiKey && config.model);
}
