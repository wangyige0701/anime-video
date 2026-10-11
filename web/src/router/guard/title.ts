import type { Router } from 'vue-router';

export function titleGuard(router: Router) {
	router.beforeEach((to, from) => {
		to.meta.setTitle = (title: string) => {
			to.meta.title = title;
			writeTitle(title);
		};

		if (to.meta.title) {
			writeTitle(to.meta.title);
		}
	});
}

function writeTitle(title: string) {
	if (!title) {
		return;
	}
	document.title = title;
}
