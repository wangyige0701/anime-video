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
			path: '/detail/:name',
			name: WebRoute.DETAIL,
			component: () => import('@/views/Detail.vue'),
			props: (route) => {
				return {
					name: decodeURIComponent((route.params.name as string) || ''),
				};
			},
		},
	],
});

export default router;
