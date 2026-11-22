import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/test/**/*.test.ts'],
		exclude: ['dev/**', '**/node_modules/**'],
		// 服务端模块在导入阶段就会读取 `__APP_CONFIG__`，必须在测试文件导入前注入
		setupFiles: ['./test/setup.ts'],
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
