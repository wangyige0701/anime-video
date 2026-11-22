import { createRouter, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';
import { titleGuard } from './guard/title';
import { loadingGuard } from './loading';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
});

titleGuard(router);
// 路由分包下载期间用全局遮罩提示，避免点开详情页时看起来「没反应」
loadingGuard(router);

export default router;
