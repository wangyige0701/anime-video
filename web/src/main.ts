import '@/assets/iconfont.scss';
import '@/assets/root.scss';
import '@/assets/main.scss';
import '@/assets/elements.scss';

import { createApp } from 'vue';

import App from './App.vue';
import router from './router';
import { pinia } from './stores/pinia';
import { usePlayerStore } from './stores/player';

const app = createApp(App);

// Pinia 实例单独导出：`openDialog()` 为对话框新建独立应用时要复用同一份状态
app.use(pinia);
app.use(router);

app.mount('#app');

// 播放器偏好（音量、自动连播、字幕开关等）在首屏并不需要立刻可用，
// 如果在这里 `await`，入口脚本会等所有本地存储读取完成才挂载应用，白白拖慢首屏。
// store 里的字段都是响应式的，读取完成后会自动同步到界面。
void usePlayerStore()
	.initialize()
	.catch((error: unknown) => {
		console.warn('[player] 读取播放器偏好失败', error);
	});
