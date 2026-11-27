import type { SettingsPatch, SettingsView } from '@/api/settings';

/**
 * 设置页的表单状态与提交补丁。
 *
 * 只提交真正变化的字段：
 * - 用户没动过的字段不出现，避免把服务端刚归一化的值再写回去；
 * - 密钥必须是显式动作（保留 / 替换 / 清除），输入框永远不回填明文；
 * - 设置视图还没加载成功时返回空补丁，绝不能把空表单当成「用户清空了配置」。
 */
export interface AiFormValues {
	baseUrl: string;
	model: string;
	proxy: string;
	timeout: number;
}

export interface BangumiFormValues {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
}

/** `keep` 不改；`replace` 提交新值；`clear` 显式清空 */
export type ApiKeyIntent = { type: 'keep' } | { type: 'clear' } | { type: 'replace'; value: string };

export function aiFormFrom(view: SettingsView | null): AiFormValues {
	return {
		baseUrl: view?.ai.baseUrl ?? '',
		model: view?.ai.model ?? '',
		proxy: view?.ai.proxy ?? '',
		timeout: view?.ai.timeout ?? 60000,
	};
}

export function bangumiFormFrom(view: SettingsView | null): BangumiFormValues {
	return {
		baseUrl: view?.bangumi.baseUrl ?? '',
		userAgent: view?.bangumi.userAgent ?? '',
		proxy: view?.bangumi.proxy ?? '',
		timeout: view?.bangumi.timeout ?? 15000,
	};
}

export function buildAiPatch(
	current: SettingsView | null,
	form: AiFormValues,
	apiKey: ApiKeyIntent,
): NonNullable<SettingsPatch['ai']> {
	const patch: NonNullable<SettingsPatch['ai']> = {};
	if (!current) {
		return patch;
	}
	assignIfChanged(patch, 'baseUrl', form.baseUrl, current.ai.baseUrl);
	assignIfChanged(patch, 'model', form.model, current.ai.model);
	assignIfChanged(patch, 'proxy', form.proxy, current.ai.proxy);
	assignIfChanged(patch, 'timeout', form.timeout, current.ai.timeout);

	if (apiKey.type === 'clear') {
		patch.apiKey = '';
	} else if (apiKey.type === 'replace') {
		const trimmed = apiKey.value.trim();
		// 空输入不提交：否则「点了替换但没填」会被当成清除
		if (trimmed) {
			patch.apiKey = trimmed;
		}
	}
	return patch;
}

export function buildBangumiPatch(
	current: SettingsView | null,
	form: BangumiFormValues,
): NonNullable<SettingsPatch['bangumi']> {
	const patch: NonNullable<SettingsPatch['bangumi']> = {};
	if (!current) {
		return patch;
	}
	assignIfChanged(patch, 'baseUrl', form.baseUrl, current.bangumi.baseUrl);
	assignIfChanged(patch, 'userAgent', form.userAgent, current.bangumi.userAgent);
	assignIfChanged(patch, 'proxy', form.proxy, current.bangumi.proxy);
	assignIfChanged(patch, 'timeout', form.timeout, current.bangumi.timeout);
	return patch;
}

function assignIfChanged<T extends object, K extends keyof T>(target: T, key: K, next: T[K], current: T[K]) {
	const normalized = typeof next === 'string' ? (next.trim() as T[K]) : next;
	if (normalized !== current) {
		target[key] = normalized;
	}
}
