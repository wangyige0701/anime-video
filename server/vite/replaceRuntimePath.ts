import type { Plugin } from 'vite';

export function replaceRuntimePath(): Plugin {
	return {
		name: 'replace-runtime-path',

		transform(code, id) {
			if (!id.endsWith('.js')) {
				return;
			}
		},
	};
}
