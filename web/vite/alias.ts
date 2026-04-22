import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function getPathAlias(): Plugin {
	const jsonFile = resolve(dirname(fileURLToPath(import.meta.url)), '../tsconfig.app.json');
	const tsAppConfig = fs.readFileSync(jsonFile, 'utf-8');
	const json = JSON.parse(tsAppConfig);
	const paths = json.compilerOptions.paths;
	const alias = Object.keys(paths).reduce(
		(prev, curr) => {
			const alias = curr.split('/')[0];
			if (!alias) {
				return prev;
			}
			let path = paths[curr][0] as string;
			if (!path) {
				return prev;
			}
			path = path.replace(/^(.+)(\/\*)$/, '$1');
			prev[alias] = resolve(jsonFile, '..', path);
			return prev;
		},
		{} as Record<string, string>,
	);

	return {
		name: 'getPathAlias',
		config() {
			return {
				resolve: {
					alias,
				},
			};
		},
	};
}
