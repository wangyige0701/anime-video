import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/test/**/*.test.ts'],
		env: {
			VIDEO_CONFIG_PREFIX: 'test',
		},
	},
	resolve: {
		alias: {
			'@server': path.resolve(__dirname, 'server'),
		},
	},
});
