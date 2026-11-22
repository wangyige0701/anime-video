import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_LOADING_DELAY, createRouteLoadingTracker, routeLoading } from '../../web/src/router/loading';

describe('createRouteLoadingTracker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		routeLoading.value = false;
	});

	afterEach(() => {
		vi.useRealTimers();
		routeLoading.value = false;
	});

	it('延迟未到不显示遮罩，到点后显示', () => {
		const tracker = createRouteLoadingTracker(120);
		tracker.start();
		vi.advanceTimersByTime(119);
		expect(routeLoading.value).toBe(false);
		vi.advanceTimersByTime(1);
		expect(routeLoading.value).toBe(true);
	});

	it('导航结束后立即收起遮罩', () => {
		const tracker = createRouteLoadingTracker(120);
		tracker.start();
		vi.advanceTimersByTime(200);
		expect(routeLoading.value).toBe(true);
		tracker.finish();
		expect(routeLoading.value).toBe(false);
		expect(tracker.pending).toBe(false);
	});

	it('切换很快时不会闪出遮罩', () => {
		const tracker = createRouteLoadingTracker(120);
		tracker.start();
		vi.advanceTimersByTime(60);
		tracker.finish();
		vi.advanceTimersByTime(1000);
		expect(routeLoading.value).toBe(false);
	});

	it('连续导航只按最后一次开始计时', () => {
		const tracker = createRouteLoadingTracker(120);
		tracker.start();
		vi.advanceTimersByTime(100);
		tracker.start();
		vi.advanceTimersByTime(100);
		expect(routeLoading.value).toBe(false);
		vi.advanceTimersByTime(20);
		expect(routeLoading.value).toBe(true);
	});

	it('收尾会清掉未触发的定时器', () => {
		const tracker = createRouteLoadingTracker(120);
		tracker.start();
		tracker.finish();
		expect(tracker.pending).toBe(false);
		vi.advanceTimersByTime(500);
		expect(routeLoading.value).toBe(false);
	});

	it('支持自定义延迟，0 表示立即显示', () => {
		const tracker = createRouteLoadingTracker(0);
		tracker.start();
		vi.advanceTimersByTime(0);
		expect(routeLoading.value).toBe(true);
	});

	it('默认延迟为 120ms', () => {
		expect(ROUTE_LOADING_DELAY).toBe(120);
	});
});
