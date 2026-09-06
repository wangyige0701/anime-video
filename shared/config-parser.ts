import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { AppConfig } from './config.d';

const configFile = await readFile(new URL('../config.yaml', import.meta.url), 'utf8');
const defaultConfig = YAML.parse(configFile) as AppConfig;

export default applyOverrides(defaultConfig);

function applyOverrides(defaultConfig: AppConfig): AppConfig {
	const config = structuredClone(defaultConfig);
	const commandLineOverrides = getCommandLineOverrides();
	// 遍历配置实际存在的字段，保证新增配置可以自动获得环境变量和命令行覆盖能力。
	for (const section of ['server', 'logging', 'web', 'hls'] as const) {
		const sectionConfig = config[section] as Record<string, unknown>;
		for (const key of Object.keys(sectionConfig)) {
			const envKey = `${section}_${toEnvKey(key)}`.toUpperCase();
			const override = commandLineOverrides.get(envKey) ?? process.env[envKey];
			if (override !== undefined) {
				sectionConfig[key] = parseValue(override, sectionConfig[key]);
			}
		}
	}
	return config;
}

function getCommandLineOverrides() {
	const overrides = new Map<string, string>();
	for (let index = 2; index < process.argv.length; index++) {
		const argument = process.argv[index]!;
		const keyValue = argument.match(/^--?([A-Za-z][A-Za-z0-9_]*)=(.*)$/);
		if (keyValue) {
			overrides.set(keyValue[1]!.toUpperCase(), keyValue[2]!);
			continue;
		}
		const key = argument.match(/^--?([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
		const nextArgument = process.argv[index + 1];
		if (key && nextArgument !== undefined && (!nextArgument.startsWith('-') || /^-\d/.test(nextArgument))) {
			overrides.set(key.toUpperCase(), process.argv[++index]!);
		}
	}
	return overrides;
}

function toEnvKey(key: string) {
	return key.replace(/[A-Z]/g, (character) => `_${character}`).toUpperCase();
}

function parseValue(value: string, defaultValue: unknown) {
	if (typeof defaultValue === 'number') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	}
	if (typeof defaultValue === 'boolean') {
		const normalized = value.toLowerCase();
		if (normalized === 'true') {
			return true;
		}
		if (normalized === 'false') {
			return false;
		}
		return defaultValue;
	}
	if (Array.isArray(defaultValue)) {
		try {
			const parsed = YAML.parse(value);
			return Array.isArray(parsed) ? parsed : value.split(',').map((item) => item.trim());
		} catch {
			return value.split(',').map((item) => item.trim());
		}
	}
	if (defaultValue && typeof defaultValue === 'object') {
		// 对象配置（例如 HTTP 事件映射）使用 YAML 解析，支持环境变量和命令行覆盖。
		try {
			const parsed = YAML.parse(value);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : defaultValue;
		} catch {
			return defaultValue;
		}
	}
	return value;
}
