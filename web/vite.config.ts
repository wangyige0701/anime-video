import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import vueDevTools from 'vite-plugin-vue-devtools';
import { getPathAlias } from './vite/alias';

// https://vite.dev/config/
export default defineConfig({
	plugins: [getPathAlias(), vue(), vueJsx(), vueDevTools()],
});
