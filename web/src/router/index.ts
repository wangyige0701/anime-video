import { createRouter, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';
import { closeAllDialogs } from '@/utils/dialog';
import { titleGuard } from './guard/title';
import { loadingGuard } from './loading';
import { scrollGuard } from './scroll';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
});

titleGuard(router);
// 路由分包下载期间用全局遮罩提示，避免点开详情页时看起来「没反应」
loadingGuard(router);
// 滚动位置记忆：滚动容器是 App 里常驻的 el-scrollbar，原生 scrollBehavior 只认 window
scrollGuard(router);

// 对话框挂在 body 上，不属于路由树：切页后必须收掉，否则会盖在新页面上
router.afterEach(() => {
	closeAllDialogs();
});

export default router;
