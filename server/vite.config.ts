import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import { replaceRuntimePath } from './vite/replaceRuntimePath.ts';
import { resolveHls } from './vite/resolveHls.ts';
import { copyImportMetaAssets } from './vite/copyImportMetaAssets.ts';

const serverDir = dirname(fileURLToPath(import.meta.url));
const repositoryDir = resolve(serverDir, '..');
const distRootDir = resolve(serverDir, 'dist');
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

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
				return nodeBuiltins.has(id) || id.startsWith('node:') || /\.(?:node|dll)$/i.test(id);
			},
			platform: 'node',
			input: {
				cli: resolve(distRootDir, 'server/cli.js'),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name]-[hash].js',
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
		},
	},
	plugins: [replaceRuntimePath(), resolveHls(), copyImportMetaAssets(['yaml'])],
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
