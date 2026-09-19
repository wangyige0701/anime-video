import { copyFile } from 'node:fs/promises';
import { basename, dirname, extname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

export function copyImportMetaAssets(extensions: string[]): Plugin {
	if (!extensions.length) {
		return {
			name: 'copy-import-meta-assets',
		};
	}

	const suffixes = new Set(extensions.map((extension) => `.${extension.replace(/^\./, '').toLowerCase()}`));
	const matchRegexp = `(?:${extensions.map((ext) => `\\.${ext.replace(/^\./, '').toLowerCase()}`).join('|')})`;
	const assetImportMetaUrlRE: RegExp = new RegExp(
		`\\bnew\\s+URL\\s*\\(\\s*('[^']+${matchRegexp}'|"[^"]+${matchRegexp}"|\`[^\`]+${matchRegexp}\`)\\s*,\\s*import\\.meta\\.url\\s*(?:,\\s*)?\\)`,
		'dg',
	);
	const files: string[] = [];

	return {
		name: 'copy-import-meta-assets',
		apply: 'build',
		enforce: 'pre',

		transform: {
			filter: {
				code: assetImportMetaUrlRE,
			},
			handler(code, id) {
				// 使用构建器自带的 AST 排除注释和字符串中的伪匹配，无需额外解析依赖。
				const starts = new Set<number>();
				const nodes: unknown[] = [this.parse(code)];
				while (nodes.length) {
					const node = nodes.pop();
					if (!node || typeof node !== 'object') {
						continue;
					}
					if ('type' in node && node.type === 'NewExpression' && 'start' in node) {
						starts.add(node.start as number);
					}
					nodes.push(...Object.values(node).filter((value) => value && typeof value === 'object'));
				}

				let changed = false;
				const result = code.replace(
					new RegExp(assetImportMetaUrlRE),
					(match, rawUrl: string, offset: number) => {
						if (!starts.has(offset) || (rawUrl[0] === '`' && rawUrl.includes('${'))) {
							return match;
						}
						const url = new URL(rawUrl.slice(1, -1), pathToFileURL(id.split(/[?#]/)[0]));
						if (url.protocol !== 'file:') {
							return match;
						}
						const file = fileURLToPath(url);
						if (!suffixes.has(extname(file).toLowerCase())) {
							return match;
						}
						let index = files.indexOf(file);
						if (index === -1) {
							if (
								files.some(
									(existing) => basename(existing).toLowerCase() === basename(file).toLowerCase(),
								)
							) {
								this.error(`配置文件重名，无法复制到同一目录：${file}`);
							}
							index = files.push(file) - 1;
						}
						this.addWatchFile(file);
						changed = true;
						// 路径留到 renderChunk 确定；拼接空串避免 Rolldown 提前处理 new URL。
						return `new URL(${JSON.stringify(`__CONFIG_FILE_${index}__${url.search}${url.hash}`)}, '' + import.meta.url)`;
					},
				);
				return changed ? { code: result, map: null } : null;
			},
		},

		renderChunk(code, chunk) {
			const result = code.replace(/__CONFIG_FILE_(\d+)__/g, (_, index: string) => {
				return posix.relative(
					posix.dirname(chunk.fileName),
					encodeURIComponent(basename(files[Number(index)])),
				);
			});
			return result === code ? null : { code: result, map: null };
		},

		async writeBundle(options) {
			// 配置文件放在最终输出目录内，与入口产物同级，例如 dist/config.yaml。
			const directory = resolve(options.dir ?? dirname(options.file!));
			await Promise.all(
				files.map(async (file) => {
					const target = resolve(directory, basename(file));
					if (target !== file) {
						await copyFile(file, target);
					}
				}),
			);
		},
	};
}
