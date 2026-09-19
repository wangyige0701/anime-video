import type { Plugin } from 'vite';

export function resolveHls(): Plugin {
	return {
		name: 'resolve-hls',

		transform(code, id) {
			if (id !== '~hls/hls.node') {
				return;
			}
			console.log(id, code);
		},
	};
}
