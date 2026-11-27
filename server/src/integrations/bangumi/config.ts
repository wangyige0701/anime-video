/**
 * Bangumi 与 AI 的服务配置。
 *
 * 三个来源，优先级从高到低：
 * 1. 进程环境变量（`BANGUMI_*` / `AI_*`，由 `shared/config-parser` 合并进 `__APP_CONFIG__`）；
 * 2. 仓库根目录 `.env`（本地调试用，与 `scripts/env.mjs` 的语法一致）；
 * 3. `config.yaml` 的默认值。
 *
 * 为什么 `.env` 单独读而不依赖启动参数：配置解析在模块导入时就要完成，
 * 此时无法保证 `.env` 已经被注入 `process.env`。这里在首次取配置时惰性合并，
 * 既不影响既有配置链路，也让本地调试脚本和服务端共用同一份 `.env`。
 *
 * 任何函数都不返回、不打印密钥；`apiKey` 只在发起请求时读取。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '~shared/config';

export interface BangumiConfig {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
}

export interface AiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	proxy: string;
	timeout: number;
}

export interface ServiceConfig {
	bangumi: BangumiConfig;
	ai: AiConfig;
}

/**
 * 解析 `.env` 文本。
 *
 * 只支持调试够用的语法：`KEY=value`、`export KEY=value`、`#` 注释、成对引号包裹。
 * 与 `scripts/env.mjs` 保持同一套规则，避免两份配置在本地表现出差异。
 */
export function parseEnvText(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) {
			continue;
		}
		const key = match[1]!;
		let value = match[2]!.trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		} else {
			const commentIndex = value.indexOf(' #');
			if (commentIndex >= 0) {
				value = value.slice(0, commentIndex).trim();
			}
		}
		result[key] = value;
	}
	return result;
}

/** 读取 `.env`；不存在或不可读时返回空对象，配置继续走环境变量与默认值 */
export function readEnvFile(file = path.resolve(process.cwd(), '.env')): Record<string, string> {
	try {
		return parseEnvText(fs.readFileSync(file, 'utf8'));
	} catch {
		return {};
	}
}

/** 按「进程环境 → .env → 默认值」的顺序取值；空串视为未配置 */
function pick(envKeys: string[], dotenv: Record<string, string>, fallback: string) {
	for (const key of envKeys) {
		const value = process.env[key]?.trim();
		if (value) {
			return value;
		}
	}
	for (const key of envKeys) {
		const value = dotenv[key]?.trim();
		if (value) {
			return value;
		}
	}
	return fallback;
}

function pickNumber(envKeys: string[], dotenv: Record<string, string>, fallback: number) {
	const value = Number(pick(envKeys, dotenv, ''));
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 从默认配置与 `.env` 合并出服务配置。
 *
 * 拆成纯函数是为了让测试不需要改动 `process.env`：直接传入一份 `.env` 映射即可验证优先级。
 */
export function resolveServiceConfig(defaults: AppConfig, dotenv: Record<string, string>): ServiceConfig {
	// 本地调试脚本历史上用的是 BGM_ 前缀，这里同时接受，避免两套配置各自维护
	return {
		bangumi: {
			baseUrl: pick(['BANGUMI_BASE_URL', 'BGM_BASE_URL'], dotenv, defaults.bangumi.baseUrl),
			userAgent: pick(['BANGUMI_USER_AGENT', 'BGM_USER_AGENT'], dotenv, defaults.bangumi.userAgent),
			proxy: pick(['BANGUMI_PROXY', 'BGM_PROXY'], dotenv, defaults.bangumi.proxy),
			timeout: pickNumber(['BANGUMI_TIMEOUT'], dotenv, defaults.bangumi.timeout),
		},
		ai: {
			baseUrl: pick(['AI_BASE_URL'], dotenv, defaults.ai.baseUrl),
			apiKey: pick(['AI_API_KEY'], dotenv, defaults.ai.apiKey),
			model: pick(['AI_MODEL'], dotenv, defaults.ai.model),
			// AI 代理不与 Bangumi 代理共用：有些模型服务本身不需要走代理
			proxy: pick(['AI_PROXY'], dotenv, defaults.ai.proxy),
			timeout: pickNumber(['AI_TIMEOUT'], dotenv, defaults.ai.timeout),
		},
	};
}

let cached: ServiceConfig | null = null;

/** 取服务配置；首次调用时读取 `.env` 并缓存 */
export function getServiceConfig(): ServiceConfig {
	if (!cached) {
		cached = resolveServiceConfig(__APP_CONFIG__, readEnvFile());
	}
	return cached;
}

/** 清空缓存，测试与配置热加载使用 */
export function clearServiceConfigCache() {
	cached = null;
}

/** AI 是否已配置完整；缺任一项时同步接口直接返回明确错误，而不是发一个必然失败的请求 */
export function isAiConfigured(config: AiConfig = getServiceConfig().ai) {
	return Boolean(config.baseUrl && config.apiKey && config.model);
}
