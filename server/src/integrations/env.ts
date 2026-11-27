/**
 * 外部服务共用的配置来源解析。
 *
 * Bangumi 与 AI 是两个独立模块，各自的配置只包含自己的键；这里只放两边都要用的
 * 「从 `.env` 文本取值」和「按 进程环境 → .env → 默认值 取一个键」的公共逻辑，
 * 不包含任何具体服务的默认值或键名。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.env` 的实际位置。
 *
 * 不能只看 `process.cwd()`：`pnpm --filter server run dev` 与 `back.cmd` 都会把工作目录切到
 * `server/`，而 `.env`（由 `scripts/init-env.mjs` 生成）在仓库根目录，只按 cwd 找会永远读不到，
 * 代理与 AI 凭据被静默忽略——表现为「接口超时 / 未配置」，排查成本很高。
 *
 * 因此按「cwd → 模块位置上溯三级（源码里即仓库根）」的顺序取第一个存在的文件；
 * 都不存在时返回 cwd 下的路径（读不到就是空配置，行为与之前一致）。
 * 打包产物里 `.env` 本来就不参与配置，多找一次也不会有副作用。
 */
export function resolveEnvFile(startCwd = process.cwd(), startModule = path.dirname(fileURLToPath(import.meta.url))) {
	const candidates = [path.resolve(startCwd, '.env'), path.resolve(startModule, '../../../.env')];
	return candidates.find((file) => fs.existsSync(file)) ?? candidates[0]!;
}

/**
 * 解析 `.env` 文本。
 *
 * 只支持调试够用的语法：`KEY=value`、`export KEY=value`、`#` 注释、成对引号包裹。
 * 与 `scripts/env.mjs` 保持同一套规则，避免同一台机器上两份配置解析结果不同。
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
export function readEnvFile(file = resolveEnvFile()): Record<string, string> {
	try {
		return parseEnvText(fs.readFileSync(file, 'utf8'));
	} catch {
		return {};
	}
}

/**
 * 按「进程环境 → .env → 默认值」取字符串。
 *
 * 为什么要显式读 `process.env`：`config-parser` 已经把进程环境合并进 `__APP_CONFIG__`，
 * 但合并后无法区分「来自环境」与「来自默认值」。如果只用 ``__APP_CONFIG__ ?? .env``，
 * `config.yaml` 里的默认值会永久压住 `.env`，本地调试改 `.env` 看起来毫无效果。
 */
export function pickString(envKeys: string[], dotenv: Record<string, string>, fallback: string) {
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

/** 同上，用于超时这类正整数配置；非法值回退默认，避免 0 或负数让请求立即失败 */
export function pickNumber(envKeys: string[], dotenv: Record<string, string>, fallback: number) {
	const value = Number(pickString(envKeys, dotenv, ''));
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
