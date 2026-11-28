/**
 * undefined 写法自检。
 *
 * 规范：判断一律用 `isUndefined()`，显式赋值一律用 `void 0`。
 * 这里只查能机械识别的形态，类型注解里的 `| undefined` 与可选属性不在检查范围。
 *
 * 用法：`node scripts/check-undefined.mjs`，有问题时退出码为 1。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGETS = ['server', 'shared', 'web/src', 'types', 'scripts', 'test', 'runtime', 'desktop', 'installer', 'ui'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'www', '.cache', '.git', 'hls']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.mjs', '.js']);

const PATTERNS = [
	{ name: '=== undefined', rule: /===\s*undefined\b/ },
	{ name: '!== undefined', rule: /!==\s*undefined\b/ },
	{ name: '= undefined', rule: /(?<![=!<>])=\s*undefined\b/ },
	{ name: 'return undefined', rule: /\breturn\s+undefined\b/ },
	{ name: '=> undefined', rule: /=>\s*undefined\b/ },
	{ name: '?? undefined', rule: /\?\?\s*undefined\b/ },
	{ name: '|| undefined', rule: /\|\|\s*undefined\b/ },
];

async function walk(directory, files) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
			continue;
		}
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await walk(full, files);
			continue;
		}
		if (EXTENSIONS.has(path.extname(entry.name))) {
			files.push(full);
		}
	}
}

const files = [];
for (const target of TARGETS) {
	const full = path.join(ROOT, target);
	if (!(await stat(full).catch(() => null))) {
		continue;
	}
	await walk(full, files);
}

const problems = [];
for (const file of files) {
	// 自检脚本自身包含用于匹配的模式字符串，跳过
	if (file === import.meta.filename) {
		continue;
	}
	const content = await readFile(file, 'utf8');
	content.split('\n').forEach((line, index) => {
		for (const pattern of PATTERNS) {
			if (pattern.rule.test(line)) {
				problems.push(`${path.relative(ROOT, file)}:${index + 1}  ${pattern.name}  ${line.trim()}`);
				break;
			}
		}
	});
}

if (problems.length) {
	console.error(`发现 ${problems.length} 处需要改写的 undefined 写法：\n`);
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log(`检查通过：${files.length} 个文件没有等号判断或 = undefined。`);
