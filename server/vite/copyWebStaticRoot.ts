import type { Plugin } from 'vite';
import { cp, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { AppConfig } from '~shared/config';

export function copyWebStaticRoot(webConfig: AppConfig['web']): Plugin {
	const source = resolve(basename(import.meta.url), `../${webConfig.webBundleDir}`);
	return {
		name: 'copy-web-static-root',

		async writeBundle(options) {
			const directory = resolve(options.dir ?? dirname(options.file!));
			if ((await stat(source)).isDirectory()) {
				await cp(source, resolve(directory, webConfig.webBundleDir), { recursive: true });
			}
		},
	};
}
