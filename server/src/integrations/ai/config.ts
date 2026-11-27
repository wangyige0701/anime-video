/**
 * AI 服务配置（OpenAI 兼容接口）。
 *
 * 唯一来源是用户设置（`src/settings/store.ts`）：随包分发的 `config.yaml` 不再保存接口地址与密钥，
 * 仓库与安装包里零凭据。这里不再自建缓存——设置存储本身持有进程内快照，写入时同步更新，
 * 少一层缓存就少一处「设置页改完不生效」的排查成本。
 *
 * 与 Bangumi 配置完全独立：两边的代理、超时、密钥互不继承。有些模型服务本身不需要走代理，
 * 复用 Bangumi 的代理只会让请求绕一圈再失败。
 */
import { DEFAULT_SETTINGS, readSettings } from '~server/src/settings/store';
import type { AiSettings } from '~server/src/settings/store';

export interface AiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	proxy: string;
	timeout: number;
}

/** 纯函数：把用户设置归一化成请求参数，便于直接以普通对象测试 */
export function resolveAiConfig(settings: AiSettings): AiConfig {
	return {
		// 末尾斜杠在这里统一去掉，调用方拼接 `/chat/completions` 时不会出现双斜杠
		baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''),
		apiKey: settings.apiKey.trim(),
		model: settings.model.trim(),
		proxy: settings.proxy.trim(),
		timeout: normalizeTimeout(settings.timeout, DEFAULT_SETTINGS.ai.timeout),
	};
}

/** 读取当前生效的 AI 配置；设置更新后下一次调用即可拿到新值 */
export async function getAiConfig(): Promise<AiConfig> {
	return resolveAiConfig((await readSettings()).ai);
}

/** 手改 `settings.json` 可能写出 0、负数或非数字，统一回退默认值，避免请求一发出就超时 */
function normalizeTimeout(value: number, fallback: number) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
