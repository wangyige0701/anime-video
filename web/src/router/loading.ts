import { ref } from 'vue';
import type { Router } from 'vue-router';

/**
 * 路由切换时的加载遮罩状态。
 *
 * 视图组件是按路由分包加载的，例如详情页带着整块播放器代码，
 * 首次进入时要先下载脚本；这段时间页面停在旧视图上没有任何反馈，
 * 会把慢网速误判成「点了没反应」。这里把导航期间的状态暴露给全局遮罩。
 */

/** 延迟多少毫秒后才显示遮罩：路由切换很快时不该闪一下 */
export const ROUTE_LOADING_DELAY = 120;

/** 路由是否正在切换（含异步组件下载），供全局遮罩读取 */
export const routeLoading = ref(false);

/**
 * 创建导航状态跟踪器。
 *
 * 拆成工厂函数是为了能脱离 vue-router 单测「延迟显示 / 立即收起」的行为。
 */
export function createRouteLoadingTracker(delay = ROUTE_LOADING_DELAY) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	return {
		/** 导航开始：延迟一小段时间确认确实卡在加载上，再显示遮罩 */
		start() {
			clearTimer();
			timer = setTimeout(() => {
				timer = null;
				routeLoading.value = true;
			}, delay);
		},
		/** 导航结束（成功、失败或被取消）：立即收起遮罩 */
		finish() {
			clearTimer();
			routeLoading.value = false;
		},
		/** 是否还有等待中的显示定时器，供测试断言 */
		get pending() {
			return timer !== null;
		},
	};
}

/**
 * 注册路由加载守卫。
 *
 * `onError` 用于分包下载失败：此时导航不会正常结束，
 * 不收起遮罩就会永久盖住页面。
 */
export function loadingGuard(router: Router) {
	const tracker = createRouteLoadingTracker();
	router.beforeEach(() => {
		tracker.start();
	});
	router.afterEach(() => {
		tracker.finish();
	});
	router.onError(() => {
		tracker.finish();
	});
	return tracker;
}
