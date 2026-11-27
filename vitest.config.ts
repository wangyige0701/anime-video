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
		alias: [
			{ find: '~server', replacement: path.resolve(__dirname, 'server') },
			{ find: '~shared', replacement: path.resolve(__dirname, 'shared') },
			// web 源码内部用 `@/` 指向 `web/src`；必须限定 `@/` 前缀，
			// 否则 `@element-plus/icons-vue` 这类包名会被当成路径改写到 web/src 下
			{ find: /^@\//, replacement: `${path.resolve(__dirname, 'web/src')}/` },
		],
	},
});
