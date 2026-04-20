import Index from '@/views/Index.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/',
			name: 'Index',
			component: Index,
		},
		{
			path: '/video/:name',
			name: 'Video',
			component: () => import('@/views/Video.vue'),
			props: (route) => {
				return {
					name: decodeURIComponent((route.params.name as string) || ''),
				};
			},
		},
	],
});

export default router;
