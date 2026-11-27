/**
 * 用户设置的存储与读写。
 *
 * 为什么单独一份文件而不是写进 `config.yaml`：`config.yaml` 随程序分发，仓库开源、
 * 安装目录通常只读、升级时会被覆盖，任何个人凭据放进去都等于公开。用户设置只描述
 * 「这个人用什么服务」，因此落在用户数据目录，仓库里零凭据。
 *
 * 与媒体数据的边界：`.video.json` 是「库」的元数据（目录变化会重建），这里是「人」的偏好，
 * 两者生命周期不同，不混存。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Data } from '~server/data/data';
import { getUserDataDirectory } from '~server/src/utils/user-data-dir';

export interface AiSettings {
	baseUrl: string;
	apiKey: string;
	model: string;
	proxy: string;
	timeout: number;
}

export interface BangumiSettings {
	baseUrl: string;
	userAgent: string;
	proxy: string;
	timeout: number;
}

export interface AppSettings {
	version: number;
	ai: AiSettings;
	bangumi: BangumiSettings;
}

/** 字段均为 `undefined` 表示不修改；空字符串表示清空 */
export interface SettingsPatch {
	ai?: Partial<AiSettings>;
	bangumi?: Partial<BangumiSettings>;
}

export interface SettingsView {
	ai: Omit<AiSettings, 'apiKey'> & { hasApiKey: boolean; apiKeyMasked: string; configured: boolean };
	bangumi: BangumiSettings & { configured: boolean };
	/** 同步功能同时依赖 Bangumi 与 AI，任一未配置时前端不展示入口 */
	syncAvailable: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
	version: 1,
	ai: {
		baseUrl: '',
		apiKey: '',
		model: '',
		proxy: '',
		timeout: 60000,
	},
	bangumi: {
		baseUrl: 'https://api.bgm.tv',
		userAgent: 'anime-video/1.0',
		proxy: '',
		timeout: 15000,
	},
};

const SETTINGS_FILE_NAME = 'settings.json';

export function getSettingsFile() {
	return path.join(getUserDataDirectory(), SETTINGS_FILE_NAME);
}

async function getStore() {
	await fs.mkdir(getUserDataDirectory(), { recursive: true });
	return Data.instance<AppSettings>(getSettingsFile(), structuredClone(DEFAULT_SETTINGS));
}

/**
 * 进程内快照。
 *
 * 设置只通过接口修改，因此写入后由本模块自己更新快照，读取方不需要关心缓存失效；
 * 手工编辑 `settings.json` 不会热加载，需要重启服务。
 */
let snapshot: AppSettings | null = null;

export function clearSettingsCache() {
	snapshot = null;
}

/** 读取设置；缺失或字段不全时按默认值补齐，保证老文件升级后仍可用 */
export async function readSettings(): Promise<AppSettings> {
	if (snapshot) {
		return snapshot;
	}
	const store = await getStore();
	snapshot = normalize(await store.read());
	return snapshot;
}

/**
 * 按补丁更新设置并落盘。
 *
 * 与「标题空值恢复默认」的约定相反：这里空字符串就是清空，调用方必须显式传 `''`，
 * 不能因为字段缺省就把密钥抹掉。
 */
export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
	const store = await getStore();
	const raw = await store.read();
	const next = clone(await readSettings());

	applyPatch(next.ai, patch.ai);
	applyPatch(next.bangumi, patch.bangumi);

	// 整体替换子对象：老文件可能缺字段，逐键赋值会留下默认值以外的脏数据
	Object.assign(raw, next);
	await store.save();

	snapshot = next;
	return snapshot;
}

/** 对外的脱敏视图：密钥只回显尾部四位，明文永不出网 */
export function toSettingsView(settings: AppSettings): SettingsView {
	const aiConfigured = isAiConfigured(settings);
	const bangumiConfigured = isBangumiConfigured(settings);
	return {
		ai: {
			baseUrl: settings.ai.baseUrl,
			model: settings.ai.model,
			proxy: settings.ai.proxy,
			timeout: settings.ai.timeout,
			hasApiKey: Boolean(settings.ai.apiKey),
			apiKeyMasked: maskSecret(settings.ai.apiKey),
			configured: aiConfigured,
		},
		bangumi: {
			...settings.bangumi,
			configured: bangumiConfigured,
		},
		syncAvailable: aiConfigured && bangumiConfigured,
	};
}

/** AI 三项缺一不可；只填地址不填密钥时发出去必然是 401，不如提前判定不可用 */
export function isAiConfigured(settings: AppSettings) {
	return Boolean(settings.ai.baseUrl && settings.ai.apiKey && settings.ai.model);
}

export function isBangumiConfigured(settings: AppSettings) {
	return Boolean(settings.bangumi.baseUrl);
}

function maskSecret(secret: string) {
	if (!secret) {
		return '';
	}
	return secret.length > 8 ? `****${secret.slice(-4)}` : '****';
}

function applyPatch<T extends object>(target: T, patch: Partial<T> | undefined) {
	if (!patch) {
		return;
	}
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) {
			continue;
		}
		(target as Record<string, unknown>)[key] = value;
	}
}

function normalize(raw: unknown): AppSettings {
	const source = (raw ?? {}) as Partial<AppSettings>;
	return {
		version: DEFAULT_SETTINGS.version,
		ai: { ...DEFAULT_SETTINGS.ai, ...pickKnownFields(source.ai, DEFAULT_SETTINGS.ai) },
		bangumi: { ...DEFAULT_SETTINGS.bangumi, ...pickKnownFields(source.bangumi, DEFAULT_SETTINGS.bangumi) },
	};
}

/** 只接受与默认值同类型的字段，避免手改文件把数字写成字符串后带崩请求 */
function pickKnownFields<T extends object>(source: Partial<T> | undefined, defaults: T): Partial<T> {
	const result: Record<string, unknown> = {};
	if (!source) {
		return result as Partial<T>;
	}
	for (const [key, defaultValue] of Object.entries(defaults)) {
		const value = (source as Record<string, unknown>)[key];
		if (typeof value === typeof defaultValue) {
			result[key] = typeof value === 'string' ? value.trim() : value;
		}
	}
	return result as Partial<T>;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
