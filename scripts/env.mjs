/**
 * 本地调试配置加载器。
 *
 * 唯一模板是仓库根目录的 `.env.example`，实际配置写在 `.env`（已被 .gitignore 忽略）。
 * 优先级：进程环境变量 > .env > .env.example 中的默认值。
 *
 * 本模块只负责解析与判空，任何函数都不打印配置值；调用方也不要把值写进日志或错误消息。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(PROJECT_ROOT, '.env');
export const EXAMPLE_FILE = path.join(PROJECT_ROOT, '.env.example');

/** 必填项；缺失时脚本无法工作，自检按此列表判定 */
export const REQUIRED_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'];

/** 可选项；缺失时不影响运行，仅功能降级 */
export const OPTIONAL_KEYS = ['BGM_PROXY', 'BGM_BASE_URL', 'BGM_USER_AGENT', 'AI_PROXY'];

/**
 * 解析 env 文本。
 *
 * 只支持调试够用的语法：`KEY=value`、`export KEY=value`、`#` 注释、
 * 成对引号包裹（引号内保留空格与 `#`）。不支持多行值与变量插值。
 */
export function parseEnv(text) {
	const result = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) {
			continue;
		}
		const key = match[1];
		let value = match[2].trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		} else {
			// 未加引号时，行内 ` #` 之后视为注释
			const commentIndex = value.indexOf(' #');
			if (commentIndex >= 0) {
				value = value.slice(0, commentIndex).trim();
			}
		}
		result[key] = value;
	}
	return result;
}

/** 读取任意 env 文件；不存在时返回空对象，不抛错 */
export function readEnvFile(file) {
	if (!fs.existsSync(file)) {
		return {};
	}
	return parseEnv(fs.readFileSync(file, 'utf8'));
}

/** 读取模板；模板缺失属于仓库结构问题，直接抛错 */
export function readEnvExample() {
	if (!fs.existsSync(EXAMPLE_FILE)) {
		throw new Error(`缺少配置模板：${EXAMPLE_FILE}`);
	}
	return readEnvFile(EXAMPLE_FILE);
}

/** 模板中声明的键名，按文件顺序 */
export function getExampleKeys() {
	return Object.keys(readEnvExample());
}

/**
 * 加载配置：模板默认值 → .env → 进程环境变量，逐层覆盖。
 * 返回值不做脱敏处理，调用方自负输出责任。
 */
export function loadEnv(file = ENV_FILE) {
	const merged = { ...readEnvExample(), ...readEnvFile(file) };
	for (const key of getExampleKeys()) {
		const fromProcess = process.env[key];
		if (fromProcess !== undefined && fromProcess !== '') {
			merged[key] = fromProcess;
		}
	}
	return merged;
}

/**
 * 断言必填项已填写。
 *
 * 只报告键名，不报告值，避免密钥进入日志或终端回滚缓冲。
 */
export function requireEnv(keys = REQUIRED_KEYS, file = ENV_FILE) {
	const config = loadEnv(file);
	const missing = keys.filter((key) => !config[key] || !String(config[key]).trim());
	if (missing.length) {
		throw new Error(`缺少必要配置：${missing.join(', ')}（请在 ${file} 中填写，脚本不会读取或输出其内容）`);
	}
	return config;
}

/** 判断是否为合法 http(s) 地址；只返回布尔值 */
export function isHttpUrl(value) {
	if (!value) {
		return false;
	}
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}
