import Index from '@/views/Index.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/',
			component: Index,
		},
		{
			path: '/detail/:name',
			component: () => import('@/views/Detail.vue'),
		},
	],
});

export default router;
