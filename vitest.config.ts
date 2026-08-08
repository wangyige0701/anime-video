import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/test/**/*.test.ts'],
		exclude: ['dev/**', '**/node_modules/**'],
		env: {
			VIDEO_CONFIG_PREFIX: 'test',
			DATA_FILE_SAVE_DELAY: '0',
		},
	},
	resolve: {
		alias: {
			'~common': path.resolve(__dirname, 'common'),
			'~server': path.resolve(__dirname, 'server'),
			'~config': path.resolve(__dirname, 'config'),
		},
	},
});
