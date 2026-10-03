import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import { replaceRuntimePath } from './vite/replaceRuntimePath.ts';
import { resolveHls } from './vite/resolveHls.ts';
import { copyImportMetaAssets } from './vite/copyImportMetaAssets.ts';
import { copyWebStaticRoot } from './vite/copyWebStaticRoot.ts';
import config from '../shared/config-parser.ts';
import { readdirSync } from 'node:fs';

const serverDir = dirname(fileURLToPath(import.meta.url));
const repositoryDir = resolve(serverDir, '..');
const distRootDir = resolve(serverDir, 'dist');
const nodeBuiltins = new Set([
	...builtinModules,
	...builtinModules.map((name) => `node:${name}`),
]);
const controllers = readdirSync(resolve(distRootDir, 'server/controller'))
	.filter((name) => name.endsWith('.js'))
	.reduce(
		(prev, curr) => {
			prev[`controller/${basename(curr, extname(curr))}`] = resolve(
				distRootDir,
				'server/controller',
				curr,
			);
			return prev;
		},
		{} as Record<string, string>,
	);

export default defineConfig({
	build: {
		target: 'node20',
		outDir: resolve(repositoryDir, 'dist'),
		ssr: true,
		emptyOutDir: true,
		emitAssets: true,
		sourcemap: false,
		minify: false,
		reportCompressedSize: false,
		assetsDir: '',
		rolldownOptions: {
			external: (id) => {
				return (
					nodeBuiltins.has(id) ||
					id.startsWith('node:') ||
					/\.(?:node|dll)$/i.test(id)
				);
			},
			platform: 'node',
			input: {
				cli: resolve(distRootDir, 'server/cli.js'),
				'daemon-entry': resolve(
					distRootDir,
					'server/cli/manager/daemon-entry.js',
				),
				worker: resolve(distRootDir, 'server/cli/worker.js'),
				...controllers,
				'log-transport': resolve(
					distRootDir,
					'server/src/log-transport.js',
				),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name].js',
				format: 'es',
				codeSplitting: {
					groups: [
						{
							name: 'common',
							minShareCount: 2,
							entriesAware: true,
						},
					],
				},
			},
			onLog(level, log, defaultHandler) {
				if (
					level === 'warn' &&
					log.code === 'EVAL' &&
					log.id?.includes('node_modules/depd')
				) {
					return;
				}

				defaultHandler(level, log);
			},
		},
	},
	plugins: [
		copyWebStaticRoot(config.web),
		replaceRuntimePath(),
		resolveHls(),
		copyImportMetaAssets(['yaml']),
	],
	resolve: {
		alias: {
			'~server': resolve(distRootDir, 'server'),
			'~shared': resolve(distRootDir, 'shared'),
		},
	},
	ssr: {
		noExternal: true,
	},
});
