import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/test/**/*.test.ts'],
		exclude: ['dev/**', '**/node_modules/**'],
		env: {
			SERVER_VIDEO_CONFIG_PREFIX: 'test',
			SERVER_DATA_FILE_SAVE_DELAY: '0',
		},
	},
	resolve: {
		alias: {
			'~server': path.resolve(__dirname, 'server'),
			'~shared': path.resolve(__dirname, 'shared'),
		},
	},
});
