import { createRouter, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';
import { titleGuard } from './guard/title';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
});

titleGuard(router);

export default router;
