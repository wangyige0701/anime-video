/**
 * 一次性迁移：把旧 `.env` 里的 AI / Bangumi 配置写进应用数据目录的 `settings.json`。
 *
 * 背景：这些配置已改为由设置页维护，服务端不再读取 `.env`。脚本只做搬运，不参与启动流程。
 * 目标目录直接用服务端的 `getDataDirectory()`，不在这里重写一遍平台规则：
 * 桌面端写系统用户目录，直接运行 server 项目时写服务目录（与目录白名单同规则）。
 *
 * 用法（经 tsx 运行才能复用服务端模块；`tsx` 是 server 包的依赖，所以借 server 执行）：
 *   pnpm --filter server exec tsx ../scripts/migrate-env.ts             # 迁移仓库根 `.env`
 *   pnpm --filter server exec tsx ../scripts/migrate-env.ts --dry-run   # 只报告会写入哪些字段
 *   pnpm --filter server exec tsx ../scripts/migrate-env.ts --file x.env
 *
 * 安全约定：只输出字段名与「跳过原因」，任何情况下都不打印配置值。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDataDirectory } from '../server/src/utils/user-data-dir';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(PROJECT_ROOT, '.env');
export const SETTINGS_FILE_NAME = 'settings.json';

type Section = 'ai' | 'bangumi';
type SettingsPatch = Partial<Record<Section, Record<string, string | number>>>;
type SettingsValue = string | number;
type SettingsFile = {
	version: number;
	ai: Record<string, SettingsValue>;
	bangumi: Record<string, SettingsValue>;
};

/** 与 `server/src/settings/store.ts` 的 DEFAULT_SETTINGS 保持一致 */
export const DEFAULT_SETTINGS: SettingsFile = {
	version: 1,
	ai: { baseUrl: '', apiKey: '', model: '', proxy: '', timeout: 60000 },
	bangumi: { baseUrl: 'https://api.bgm.tv', userAgent: 'anime-video/1.0', proxy: '', timeout: 15000 },
};

interface Field {
	env: string[];
	section: Section;
	key: string;
	number?: boolean;
}

/** 旧键名 → `settings.json` 字段；数组顺序即同一字段的优先级 */
const FIELDS: Field[] = [
	{ env: ['AI_BASE_URL'], section: 'ai', key: 'baseUrl' },
	{ env: ['AI_API_KEY'], section: 'ai', key: 'apiKey' },
	{ env: ['AI_MODEL'], section: 'ai', key: 'model' },
	{ env: ['AI_PROXY'], section: 'ai', key: 'proxy' },
	{ env: ['AI_TIMEOUT'], section: 'ai', key: 'timeout', number: true },
	{ env: ['BANGUMI_BASE_URL', 'BGM_BASE_URL'], section: 'bangumi', key: 'baseUrl' },
	{ env: ['BANGUMI_USER_AGENT', 'BGM_USER_AGENT'], section: 'bangumi', key: 'userAgent' },
	{ env: ['BANGUMI_PROXY', 'BGM_PROXY'], section: 'bangumi', key: 'proxy' },
	{ env: ['BANGUMI_TIMEOUT'], section: 'bangumi', key: 'timeout', number: true },
];

/**
 * 解析 env 文本：`KEY=value`、`export KEY=value`、`#` 注释、成对引号包裹。
 * 与旧 `scripts/env.mjs` 规则一致，避免同一台机器上迁移结果与当初读取的值不同。
 */
export function parseEnvText(text: string) {
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

/** 读取任意 env 文件；不存在时返回空对象 */
export function readEnvFile(file: string) {
	if (!fs.existsSync(file)) {
		return {};
	}
	return parseEnvText(fs.readFileSync(file, 'utf8'));
}

/**
 * 把 env 键值转成设置补丁。
 *
 * 只返回非空字段；超时不是正整数时按「非法」跳过，交给默认值，
 * 不让一个手误把 0 写进配置。
 */
export function envToSettingsPatch(env: Record<string, string | undefined>) {
	const patch: SettingsPatch = {};
	for (const field of FIELDS) {
		const raw = field.env.map((key) => env[key]).find((value) => value !== undefined && value.trim() !== '');
		if (raw === undefined) {
			continue;
		}
		let value: string | number = raw.trim();
		if (field.number) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				continue;
			}
			value = Math.round(parsed);
		}
		patch[field.section] ??= {};
		patch[field.section]![field.key] = value;
	}
	return patch;
}

/** 只补空字段：设置页里已经填过的值不覆盖，避免迁移把新配置顶回旧值 */
export function mergeIntoExisting(existing: Partial<SettingsFile> | null, patch: SettingsPatch) {
	const merged: SettingsFile = {
		version: DEFAULT_SETTINGS.version,
		ai: { ...DEFAULT_SETTINGS.ai, ...existing?.ai },
		bangumi: { ...DEFAULT_SETTINGS.bangumi, ...existing?.bangumi },
	};
	const applied: string[] = [];
	const skipped: string[] = [];

	for (const [section, values] of Object.entries(patch) as Array<[Section, Record<string, SettingsValue>]>) {
		for (const [key, value] of Object.entries(values)) {
			const current = merged[section][key];
			const isEmpty = current === undefined || current === null || String(current).trim() === '';
			if (!isEmpty) {
				skipped.push(`${section}.${key}`);
				continue;
			}
			merged[section][key] = value;
			applied.push(`${section}.${key}`);
		}
	}

	return { merged, applied, skipped };
}

export interface MigrateOptions {
	envFile?: string;
	dataDir?: string;
	dryRun?: boolean;
}

export function migrate(options: MigrateOptions = {}) {
	const envFile = options.envFile ?? ENV_FILE;
	const dryRun = Boolean(options.dryRun);
	const env = readEnvFile(envFile);
	const patch = envToSettingsPatch(env);
	const settingsFile = path.join(options.dataDir ?? getDataDirectory(), SETTINGS_FILE_NAME);

	let existing: Partial<SettingsFile> | null = null;
	try {
		existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Partial<SettingsFile>;
	} catch {}

	const { merged, applied, skipped } = mergeIntoExisting(existing, patch);
	if (!dryRun && applied.length) {
		fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
		fs.writeFileSync(settingsFile, `${JSON.stringify(merged, null, '\t')}\n`, 'utf8');
	}

	return { envFile, settingsFile, dryRun, applied, skipped, found: Object.keys(patch).length > 0 };
}

function main() {
	const args = process.argv.slice(2);
	const options: MigrateOptions = { dryRun: args.includes('--dry-run') };
	const fileIndex = args.indexOf('--file');
	if (fileIndex >= 0) {
		options.envFile = path.resolve(args[fileIndex + 1] ?? '');
	}

	const result = migrate(options);
	if (!result.found) {
		console.log(`没有在 ${result.envFile} 中找到需要迁移的 AI / Bangumi 配置。`);
		return;
	}
	if (!result.applied.length) {
		console.log(
			`设置已存在，未覆盖任何字段${result.skipped.length ? `（跳过：${result.skipped.join(', ')}）` : ''}。`,
		);
		return;
	}
	console.log(`${result.dryRun ? '将写入' : '已写入'} ${result.settingsFile}：${result.applied.join(', ')}。`);
	if (result.skipped.length) {
		console.log(`设置中已有值，保持不变：${result.skipped.join(', ')}。`);
	}
	if (result.dryRun) {
		console.log('这是预演（--dry-run），没有修改任何文件。');
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
