/**
 * 设置项的连通性探测。
 *
 * 与业务请求分开：探测不做重试、不回显上游原始报文，只回答「这组配置现在能不能用」。
 * 失败时给出可操作的原因（密钥、地址、代理），而不是把上游的英文错误原样抛给用户。
 */
import { Status } from '~shared/http-status';
import { ApiError } from '~server/src/error';
import { requestJson } from '~server/src/integrations/http';
import { isAiConfigured, isBangumiConfigured, readSettings } from './store';
import type { JsonRequestOptions } from '~server/src/integrations/http';

export interface ProbeResult {
	ok: true;
	latencyMs: number;
	detail: string;
}

/** 探测超时上限：设置页是交互场景，等待超过 20s 不如直接报失败 */
const PROBE_TIMEOUT_MS = 20000;

export async function probeAi(): Promise<ProbeResult> {
	const settings = await readSettings();
	if (!isAiConfigured(settings)) {
		throw probeError('AI 接口未配置完整，请先填写地址、密钥和模型');
	}

	const { ai } = settings;
	const startedAt = performance.now();
	const base = ai.baseUrl.replace(/\/+$/, '');
	const options: JsonRequestOptions = {
		headers: { Authorization: `Bearer ${ai.apiKey}` },
		timeout: Math.min(ai.timeout, PROBE_TIMEOUT_MS),
		proxy: ai.proxy,
	};

	const models = await request(`${base}/models`, options);
	// `/models` 开销最小，但不是所有 OpenAI 兼容实现都提供；不可用时退回一次最小对话请求
	if (isSuccess(models.status)) {
		return result(startedAt, `模型接口可用（HTTP ${models.status}）`);
	}
	if (models.status === 400 || models.status === 404 || models.status === 405) {
		const chat = await request(`${base}/chat/completions`, {
			...options,
			method: 'POST',
			body: {
				model: ai.model,
				messages: [{ role: 'user', content: 'ping' }],
				max_tokens: 1,
				temperature: 0,
			},
		});
		if (isSuccess(chat.status)) {
			return result(startedAt, `对话接口可用（HTTP ${chat.status}）`);
		}
		throw probeError(describeStatus(chat.status, 'AI 接口'));
	}
	throw probeError(describeStatus(models.status, 'AI 接口'));
}

export async function probeBangumi(): Promise<ProbeResult> {
	const settings = await readSettings();
	if (!isBangumiConfigured(settings)) {
		throw probeError('Bangumi 接口地址为空，请先填写地址');
	}

	const startedAt = performance.now();
	const base = settings.bangumi.baseUrl.replace(/\/+$/, '');
	const response = await request(`${base}/v0/subjects/1`, {
		headers: { 'User-Agent': settings.bangumi.userAgent },
		timeout: Math.min(settings.bangumi.timeout, PROBE_TIMEOUT_MS),
		proxy: settings.bangumi.proxy,
	});

	// 404 说明地址可达且 UA 被接受，只是条目不存在；只有非 2xx/404 才算失败
	if (isSuccess(response.status) || response.status === 404) {
		return result(startedAt, `Bangumi 接口可用（HTTP ${response.status}）`);
	}
	throw probeError(describeStatus(response.status, 'Bangumi 接口'));
}

/** 网络层异常（超时、DNS、代理不通）转成可读文案，避免上游英文错误直接冒给用户 */
async function request(url: string, options: JsonRequestOptions) {
	try {
		return await requestJson(url, options);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw probeError(`无法连接到 ${new URL(url).host}：${reason}`);
	}
}

function result(startedAt: number, detail: string): ProbeResult {
	return { ok: true, latencyMs: Math.round(performance.now() - startedAt), detail };
}

function isSuccess(status: number) {
	return status >= 200 && status < 300;
}

/**
 * 把上游状态码翻译成用户能处理的提示。
 *
 * 不回显响应体：部分服务会把密钥回写到错误信息里，出口只保留状态码与通用建议。
 */
function describeStatus(status: number, target: string) {
	if (status === 401 || status === 403) {
		return `${target}鉴权失败（HTTP ${status}），请检查密钥`;
	}
	if (status === 404) {
		return `${target}地址不存在（HTTP 404），请按服务商文档核对路径`;
	}
	if (status === 429) {
		return `${target}被限流（HTTP 429），请稍后重试`;
	}
	if (status >= 500) {
		return `${target}服务端异常（HTTP ${status}）`;
	}
	if (status === 0) {
		return `${target}无响应，请检查网络或代理设置`;
	}
	return `${target}返回异常状态（HTTP ${status}）`;
}

function probeError(message: string) {
	return new ApiError(Status.Failed, message, message);
}
