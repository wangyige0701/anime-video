import { defineConfig, searchForWorkspaceRoot } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import vueDevTools from 'vite-plugin-vue-devtools';
import VueRouter from 'vue-router/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { getPathAlias } from './vite/alias';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		getPathAlias(),
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
		vueDevTools(),
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
});
