import { AxiosRequest } from 'axios-useful';
import { ServerRoot } from '~shared/server-route-config';
import { API } from '@/api';

/**
 * 用户设置接口。
 *
 * 密钥永不回填明文：服务端只给 `hasApiKey` 与尾部四位的掩码，页面据此显示「已设置 ****abcd」，
 * 保存时也只在用户主动点「替换」后才提交新值。
 */
export interface AiSettingsView {
	baseUrl: string;
	model: string;
	proxy: string;
	timeout: number;
	hasApiKey: boolean;
	apiKeyMasked: string;
	configured: boolean;
}

export interface BangumiSettingsView {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
	configured: boolean;
}

export interface SettingsView {
	ai: AiSettingsView;
	bangumi: BangumiSettingsView;
	/** AI 与 Bangumi 都可用时同步入口才展示 */
	syncAvailable: boolean;
}

/** 字段缺省表示不修改；`apiKey: ''` 表示清空 */
export interface SettingsPatch {
	ai?: {
		baseUrl?: string;
		apiKey?: string;
		model?: string;
		proxy?: string;
		timeout?: number;
	};
	bangumi?: {
		baseUrl?: string;
		userAgent?: string;
		proxy?: string;
		timeout?: number;
	};
}

export interface ProbeResult {
	ok: boolean;
	latencyMs: number;
	detail: string;
}

const SETTINGS_URL = `${ServerRoot.DATA}/settings`;

export function getSettings() {
	return API.get<any, SettingsView>(SETTINGS_URL, {
		retry: {
			count: 2,
			delay: 500,
		},
	});
}

export function saveSettings(patch: SettingsPatch) {
	return API.put<any, SettingsView>(SETTINGS_URL, patch, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

/** 探测当前已保存的 AI 配置；页面上的未保存改动不参与 */
export function probeAiSettings() {
	return API.post<any, ProbeResult>(`${SETTINGS_URL}/ai/probe`, null, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}

export function probeBangumiSettings() {
	return API.post<any, ProbeResult>(`${SETTINGS_URL}/bangumi/probe`, null, {
		single: {
			type: AxiosRequest.Single.PREV,
		},
	});
}
