import Index from '@/views/Index.vue';
import { WebRoute } from '~routes/web';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/',
			name: WebRoute.INDEX,
			component: Index,
		},
		{
			path: '/:seriesId([a-fA-F0-9]{32})/:name',
			name: WebRoute.DETAIL,
			component: () => import('@/views/Detail.vue'),
		},
	],
});

export default router;
