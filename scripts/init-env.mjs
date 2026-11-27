#!/usr/bin/env node
/**
 * 本地调试配置初始化。
 *
 * 用法：
 *   node scripts/init-env.mjs           # 按 .env.example 整体重写 .env，沿用已填写的值
 *   node scripts/init-env.mjs --check   # 检查填写状态，不输出任何配置值
 *
 * 规则：
 * - `.env.example` 是唯一模板，键的顺序、注释、默认值都以它为准。
 * - `.env` 每次整体重写，不保留模板之外的键（模板删掉的键直接移除，不留注释）。
 * - 模板中仍存在的键，若 `.env` 已有非空值，则沿用该值，不会被模板默认值覆盖。
 *
 * 安全约定：脚本从不打印、不写日志、不上报 `.env` 中的任何值；
 * `--check` 只输出「已填写 / 未填写 / 格式无效」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	ENV_FILE,
	EXAMPLE_FILE,
	OPTIONAL_KEYS,
	PROJECT_ROOT,
	REQUIRED_KEYS,
	isHttpUrl,
	loadEnv,
	readEnvExample,
	readEnvFile,
} from './env.mjs';

const CHECK_ONLY = process.argv.slice(2).includes('--check');

const KEY_LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function ensureEnvIgnored() {
	const gitignoreFile = path.join(PROJECT_ROOT, '.gitignore');
	if (!fs.existsSync(gitignoreFile)) {
		return false;
	}
	return fs
		.readFileSync(gitignoreFile, 'utf8')
		.split(/\r?\n/)
		.some((line) => line.trim() === '.env' || line.trim() === '.env*');
}

/** 按模板渲染 .env 内容，模板中每个赋值行的值优先沿用旧 .env */
export function renderEnv(templateText, existing) {
	const lines = templateText.split(/\r?\n/);
	const reused = [];
	const added = [];
	const rendered = lines.map((line) => {
		const match = line.match(KEY_LINE);
		if (!match) {
			return line;
		}
		const key = match[1];
		const templateValue = match[2].trim();
		const previous = existing[key];
		if (previous !== undefined && previous !== '') {
			if (previous !== templateValue) {
				reused.push(key);
			}
			return `${key}=${previous}`;
		}
		if (previous === undefined) {
			added.push(key);
		}
		return `${key}=${templateValue}`;
	});
	return { content: rendered.join('\n'), reused, added };
}

function initEnv() {
	if (!fs.existsSync(EXAMPLE_FILE)) {
		console.error(`缺少模板文件：${EXAMPLE_FILE}`);
		return 1;
	}

	const templateText = fs.readFileSync(EXAMPLE_FILE, 'utf8');
	const exampleKeys = new Set(Object.keys(readEnvExample()));
	const existing = fs.existsSync(ENV_FILE) ? readEnvFile(ENV_FILE) : {};
	const removed = Object.keys(existing).filter((key) => !exampleKeys.has(key));

	const { content, reused, added } = renderEnv(templateText, existing);
	const tempFile = `${ENV_FILE}.tmp`;
	fs.writeFileSync(tempFile, content, 'utf8');
	fs.renameSync(tempFile, ENV_FILE);

	console.log(`已生成：${ENV_FILE}`);
	console.log(`  沿用已有值：${reused.length ? reused.join(', ') : '无'}`);
	console.log(`  新增键：${added.length ? added.join(', ') : '无'}`);
	console.log(`  移除键：${removed.length ? removed.join(', ') : '无'}`);
	const missing = REQUIRED_KEYS.filter((key) => !existing[key] || !String(existing[key]).trim());
	if (missing.length) {
		console.log(`待填写：${missing.join(', ')}`);
	}
	console.log('自检：node scripts/init-env.mjs --check（只报状态，不回显值）');
	if (!ensureEnvIgnored()) {
		console.warn('警告：.gitignore 中未匹配到 .env，提交前请确认不会误传密钥。');
	}
	return 0;
}

function checkEnv() {
	const config = loadEnv();
	const keys = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];
	const width = Math.max(...keys.map((key) => key.length));
	const urlKeys = new Set(['BGM_BASE_URL', 'AI_BASE_URL', 'BGM_PROXY', 'AI_PROXY']);
	let missing = 0;
	let invalid = 0;

	console.log(`配置文件：${ENV_FILE}${fs.existsSync(ENV_FILE) ? '' : '（尚未生成，当前按模板默认值）'}`);
	for (const key of keys) {
		const value = config[key];
		let status;
		if (!value || !String(value).trim()) {
			if (REQUIRED_KEYS.includes(key)) {
				status = '未填写';
				missing++;
			} else {
				status = '未填写（可选）';
			}
		} else if (urlKeys.has(key) && !isHttpUrl(value)) {
			status = '格式无效（需 http:// 或 https:// 开头）';
			invalid++;
		} else {
			status = '已填写';
		}
		console.log(`  ${key.padEnd(width)}  ${status}`);
	}

	if (missing || invalid) {
		console.log(`结果：${missing} 项必填未填写${invalid ? `，${invalid} 项格式无效` : ''}`);
		return 1;
	}
	console.log('结果：必填项已就绪（未校验密钥是否有效）');
	return 0;
}

// 仅在作为命令直接执行时运行；被测试导入时只导出纯函数。
const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
	process.exitCode = CHECK_ONLY ? checkEnv() : initEnv();
}
