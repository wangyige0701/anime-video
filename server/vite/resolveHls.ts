import type { Plugin } from 'vite';
import { Node } from '@oxc-project/types';
import { isString } from '@wang-yige/utils';
import { symlink, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveHls(): Plugin {
	const pluginDir = dirname(fileURLToPath(import.meta.url));
	const hlsDirectory = resolve(pluginDir, '../../hls/build');
	const regexp = /\~hls\/hls\.node/dg;

	return {
		name: 'resolve-hls',

		transform: {
			filter: {
				code: regexp,
			},
			async handler(code, id) {
				if (!id.split(/[?#]/)[0].endsWith('.js')) {
					return;
				}

				let replace = false;
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
						callee.name === 'require' &&
						node.arguments[0].type === 'Literal' &&
						isString(node.arguments[0].value) &&
						node.arguments[0].value === '~hls/hls.node'
					) {
						replace = true;
						starts.add(node.start + 'require('.length + 1);
						continue;
					}
				}

				if (!replace) {
					return null;
				}

				const result = code.replace(regexp, (match, offset: number) => {
					if (!starts.has(offset)) {
						return match;
					}
					return '__NODE_HLS__';
				});

				return { code: result, map: null };
			},
		},

		renderChunk(code, chunk) {
			if (!code.match(/__NODE_HLS__/g)) {
				return null;
			}
			const result = code.replace(/__NODE_HLS__/g, () => {
				return relative(
					dirname(chunk.fileName),
					'hls/hls.node',
				).replaceAll('\\', '/');
			});
			return { code: result, map: null };
		},

		async writeBundle(options) {
			const directory = resolve(
				options.dir ?? dirname(options.file!),
				'hls',
			);
			try {
				await rm(directory, { recursive: true, force: true });
			} catch {}
			await symlink(hlsDirectory, directory, 'junction');
		},
	};
}
