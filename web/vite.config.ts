import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import VueRouter from 'vue-router/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { getPathAlias } from './vite/alias.ts';
import config from '../shared/config-parser.ts';
import { injectCsrfHtml } from '../shared/csrf-secret.ts';

/**
 * 开发期把 CSRF 令牌随页面注入。
 *
 * 只做一件事：把 `index.html` 交给服务端同一份实现（`shared/csrf-secret` 的
 * `injectCsrfHtml()`）处理。令牌不单独开接口，随文档下发；发布后由
 * `server/cli/web.ts` 走完全相同的函数，开发与发布的签名规则不会分叉。
 *
 * 数据目录沿用 `getDataDirectory()` 的开发态规则（服务目录），允许
 * `ANIME_VIDEO_DATA_DIR` 覆盖——与运行时读的是同一份密钥文件。
 */
function csrfToken(): Plugin {
	const dataDirectory = process.env.ANIME_VIDEO_DATA_DIR
		? path.resolve(process.env.ANIME_VIDEO_DATA_DIR)
		: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');
	return {
		name: 'anime-video:csrf-token',
		// 只在开发服务注入：构建产物不能带死一个构建期的令牌，发布后由
		// server/cli/web.ts 在每次返回 index.html 时注入新的
		apply: 'serve',
		transformIndexHtml(html) {
			return injectCsrfHtml(html, dataDirectory);
		},
	};
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
	const define = {
		__APP_CONFIG__: JSON.stringify(config),
	};

	return {
		plugins: [
			getPathAlias(),
			csrfToken(),
			VueRouter({
				dts: 'typed-router.d.ts',
				routesFolder: 'src/views',
				extendRoute(route) {
					if (route.path.includes(':seriesId')) {
						// 系列 ID 为 32 位十六进制字符串
						route.path = route.path.replace(':seriesId', ':seriesId([a-fA-F0-9]{32})');
					}
				},
			}),
			vue(),
			vueJsx(),
			AutoImport({
				resolvers: [ElementPlusResolver()],
				imports: ['vue', 'vue-router', 'pinia', { 'status-ref/vue': ['useVueStatusRef'] }],
				dts: 'auto-imports.d.ts',
			}),
			Components({
				resolvers: [ElementPlusResolver()],
				dirs: ['src/components'],
				globsExclude: ['src/components/**/layouts/**/*.vue'],
				extensions: ['vue', 'tsx'],
				deep: true,
				dts: 'components.d.ts',
			}),
		],
		server: {
			fs: {
				allow: [path.resolve(searchForWorkspaceRoot(process.cwd()), '..')],
			},
		},
		define: command === 'build' ? {} : define,
	};
});
