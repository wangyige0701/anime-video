import type { Plugin } from 'vite';
import type { Node } from '@oxc-project/types';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function replaceRuntimePath(): Plugin {
	const pluginDir = dirname(fileURLToPath(import.meta.url));
	const targetPath = resolve(pluginDir, '../dist/shared/runtime.js');
	const distDir = resolve(pluginDir, '../dist/server');
	const regexp =
		/runtimePath\(import\.meta\.url, \s*('[^']+'|"[^"]+"|`[^`]+`)\s*\)/dg;

	return {
		name: 'replace-runtime-path',

		transform: {
			filter: {
				code: regexp,
			},
			async handler(code, id) {
				if (!id.split(/[?#]/)[0].endsWith('.js')) {
					return;
				}

				const ast = this.parse(code);
				let replace = false;
				loop: for (const node of ast.body) {
					if (node.type !== 'ImportDeclaration') {
						continue;
					}
					const path = await this.resolve(node.source.value, id);
					if (!path?.id || resolve(path.id) !== targetPath) {
						continue;
					}
					for (const specifier of node.specifiers) {
						if (
							specifier.type === 'ImportSpecifier' &&
							specifier.imported.type === 'Identifier' &&
							specifier.imported.name === 'runtimePath'
						) {
							replace = true;
							break loop;
						}
					}
				}

				if (!replace) {
					return null;
				}

				const starts = new Set<number>();
				const nodes: Array<Node> = [this.parse(code)];
				while (nodes.length) {
					const node = nodes.pop();
					if (!node || typeof node !== 'object') {
						continue;
					}
					nodes.push(
						...Object.values(node).filter(
							(value) => value && typeof value === 'object',
						),
					);

					if (node?.type !== 'CallExpression') {
						continue;
					}
					const callee = node.callee;
					if (
						callee.type === 'Identifier' &&
						callee.name === 'runtimePath'
					) {
						starts.add(node.start);
					}
				}

				const result = code.replace(
					regexp,
					(match, rawUrl: string, offset: number) => {
						if (!starts.has(offset)) {
							return match;
						}
						const url = new URL(
							rawUrl.slice(1, -1),
							pathToFileURL(id.split(/[?#]/)[0]),
						);
						if (url.protocol !== 'file:') {
							return match;
						}
						const templateString =
							rawUrl[0] === '`' && rawUrl.includes('${');
						const file = fileURLToPath(url);
						const ext = extname(file);
						const dir = dirname(file);
						const name = basename(file, ext);
						let newFile = file;
						if (!templateString && name && ext) {
							newFile = resolve(dir, `${name}.js`);
						}
						let relativePath = relative(dirname(distDir), newFile);
						relativePath = relativePath.replaceAll('\\', '/');
						return `__runtimeFileURLToPath(new URL(${JSON.stringify('./' + basename(relativePath))}, '' + import.meta.url))`;
					},
				);
				const importStatement = `import { fileURLToPath as __runtimeFileURLToPath } from 'node:url';\n`;
				return { code: importStatement + result, map: null };
			},
		},
	};
}
