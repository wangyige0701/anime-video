/**
 * AI 客户端（OpenAI 兼容 chat.completions）。
 *
 * 只做「发消息、拿 JSON」这一件事，不包含任何业务提示词或结果校验：
 * 业务语义属于调用方（如 Bangumi 同步），这里保持通用，换模型供应商时只改配置。
 *
 * 兼容性取舍：
 * - `response_format: json_object` 与 `thinking: { type: 'disabled' }` 都不是所有实现都支持，
 *   收到 4xx 时逐项剥离重试，而不是要求用户换模型；
 * - 不主动 `stream`，一次请求拿完整结果，便于校验与日志。
 */
import { Status } from '~shared/http-status';
import { ApiError } from '~server/src/error';
import { isAiConfigured, readSettings } from '~server/src/settings/store';
import { resolveAiConfig } from './config';
import { requestJsonWithRetry } from '../http';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
}

export interface ChatResult {
	content: string;
	usage?: ChatUsage;
}

/**
 * 上游失败的统一错误。
 *
 * `ApiError` 的第二个参数是响应体、第三个才是 `Error.message`；这里两处都传同一句话，
 * 保证前端能拿到原因、服务端日志也有可读消息。不改变既有错误响应形状。
 */
function upstreamError(message: string) {
	return new ApiError(Status.BadGateway, message, message);
}

interface ChatResponse {
	choices?: Array<{ message?: { content?: string } }>;
	usage?: ChatUsage;
}

/** 从模型输出里取出 JSON 对象：兼容裸 JSON、```json 代码块、前后夹带说明 */
export function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed);
	} catch {}
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenced) {
		try {
			return JSON.parse(fenced[1]!.trim());
		} catch {}
	}
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) {
		try {
			return JSON.parse(trimmed.slice(start, end + 1));
		} catch {}
	}
	throw upstreamError(`AI 输出无法解析为 JSON：${trimmed.slice(0, 200)}`);
}

/**
 * 请求一次 JSON 结果。
 *
 * `maxInputChars` 不是硬限制，只用于在超长输入时给出可诊断的错误，
 * 避免把「上下文超限」表现成模型输出为空。
 */
export async function chatJson(messages: ChatMessage[], timeout?: number): Promise<ChatResult> {
	const settings = await readSettings();
	if (!isAiConfigured(settings)) {
		const message = '未配置 AI 接口，请到 设置 → AI 接口 填写接口地址、密钥和模型';
		throw new ApiError(Status.ServiceUnavailable, message, message);
	}
	const config = resolveAiConfig(settings.ai);
	const url = `${config.baseUrl}/chat/completions`;
	const body: Record<string, unknown> = {
		model: config.model,
		messages,
		temperature: 0,
		response_format: { type: 'json_object' },
		// 关闭思考能显著降低延迟与 token；部分兼容实现不认这个字段，失败后会剥离
		thinking: { type: 'disabled' },
	};
	const post = () =>
		requestJsonWithRetry<ChatResponse>(url, {
			method: 'POST',
			headers: { Authorization: `Bearer ${config.apiKey}` },
			body,
			proxy: config.proxy,
			timeout: timeout ?? config.timeout,
		});

	let response = await post();
	if (response.status >= 400 && response.status < 500 && 'thinking' in body) {
		delete body.thinking;
		response = await post();
	}
	if (response.status >= 400 && response.status < 500 && 'response_format' in body) {
		delete body.response_format;
		response = await post();
	}
	if (response.status !== 200 || !response.data) {
		// 只回传状态码与截断的响应体，错误信息里不出现密钥
		throw upstreamError(`AI 请求失败：HTTP ${response.status} ${response.raw.slice(0, 200)}`);
	}
	const content = response.data.choices?.[0]?.message?.content?.trim();
	if (!content) {
		throw upstreamError('AI 返回内容为空');
	}
	return { content, usage: response.data.usage };
}
