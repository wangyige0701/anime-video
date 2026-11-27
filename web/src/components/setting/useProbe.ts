import type { ProbeResult } from '@/api/settings';
import { getApiErrorMessage } from '@/utils/apiError';

export interface ProbeState {
	ok: boolean;
	text: string;
}

/**
 * 设置项的「测试连接」结果。
 *
 * 只负责发请求与生成一行文案；按钮的进行中状态由调用方的 `useVueStatusRef` 管理，
 * 两个分组共用同一套展示规则（成功带耗时，失败只留原因）。
 */
export function useProbe(run: () => Promise<ProbeResult>) {
	const state = ref<ProbeState | null>(null);

	async function probe() {
		try {
			const result = await run();
			state.value = { ok: true, text: `${result.latencyMs} ms · ${result.detail}` };
		} catch (error) {
			state.value = { ok: false, text: describeProbeError(error) };
		}
	}

	function reset() {
		state.value = null;
	}

	return { state, probe, reset };
}

/**
 * 探测失败的文案。
 *
 * 业务失败由响应拦截器抛普通 `Error`（消息是服务端给的中文原因），
 * 网络失败是 axios 错误，必须交给 `getApiErrorMessage` 翻译，否则会把英文原文露出去。
 */
function describeProbeError(error: unknown) {
	if (error instanceof Error && !('isAxiosError' in error)) {
		return error.message;
	}
	return getApiErrorMessage(error) || '测试失败，请稍后重试';
}
