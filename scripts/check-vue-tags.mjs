/**
 * 检查 Vue 模板里是否有自闭合的 `<slot>`。
 *
 * 约定（见 `web/AGENTS.md` 的「标签闭合」）：`slot` 是内容占位而不是组件实例，必须写显式闭合标签，
 * 禁止 `<slot />`；其余标签（`component`、`transition`、自定义组件、第三方组件）都按组件处理，
 * 无子内容时照常用自闭合。
 *
 * 用法：
 *   node scripts/check-vue-tags.mjs          # 检查 web/src
 *   node scripts/check-vue-tags.mjs web/src  # 指定目录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TAG_PATTERN = /<([A-Za-z][A-Za-z0-9._:-]*)((?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?)\/>/g;

/** 只认 slot：它没有等价组件写法，大小写变体一并覆盖 */
const normalize = (tag) => tag.toLowerCase();

function collect(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collect(full, out);
		} else if (entry.name.endsWith('.vue')) {
			out.push(full);
		}
	}
	return out;
}

/** 注释里的示例不参与检查；用等长空白替换，保证行号不变 */
function maskComments(source) {
	return source.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

const targets = process.argv.slice(2);
const dirs = targets.length ? targets : [path.join(PROJECT_ROOT, 'web', 'src')];
const problems = [];

for (const dir of dirs) {
	for (const file of collect(path.resolve(PROJECT_ROOT, dir))) {
		const source = maskComments(fs.readFileSync(file, 'utf8'));
		for (const match of source.matchAll(TAG_PATTERN)) {
			const tag = match[1];
			if (normalize(tag) !== 'slot') continue;
			const line = source.slice(0, match.index).split('\n').length;
			problems.push({
				file: path.relative(PROJECT_ROOT, file).replace(/\\/g, '/'),
				line,
				tag,
			});
		}
	}
}

if (!problems.length) {
	console.log(`标签闭合检查通过（${dirs.join(', ')}）`);
	process.exit(0);
}

for (const { file, line, tag } of problems) {
	console.error(`${file}:${line}  <${tag} /> 应写成 <${tag}></${tag}>`);
}
console.error(`\n共 ${problems.length} 处自闭合的 <slot>。其余标签按组件处理，允许自闭合。`);
process.exit(1);
