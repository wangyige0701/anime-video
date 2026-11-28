import { describe, expect, it } from 'vitest';
import { createScrollMemory, type ScrollTarget } from '../../web/src/router/scroll';

/** 假滚动容器：记录被设进去的值，模拟「内容不够高时被截断」 */
function fakeTarget(initial = 0) {
	let top = initial;
	let max = Number.POSITIVE_INFINITY;
	const target: ScrollTarget = {
		get: () => top,
		set: (value) => {
			top = Math.min(value, max);
		},
	};
	return {
		target,
		get top() {
			return top;
		},
		/** 模拟内容高度：可滚动上限 */
		setMax(next: number) {
			max = next;
		},
	};
}

describe('滚动位置记忆', () => {
	it('记录后能恢复到离开时的位置', () => {
		const container = fakeTarget();
		const memory = createScrollMemory(() => container.target);

		container.target.set(1280);
		memory.save(1);

		container.target.set(0);
		expect(memory.restore(1)).toBe(1280);
		expect(container.top).toBe(1280);
	});

	it('没有记录的历史项回到顶部', () => {
		const container = fakeTarget(640);
		const memory = createScrollMemory(() => container.target);

		expect(memory.restore(7)).toBe(0);
		expect(container.top).toBe(0);
	});

	it('不同历史项互不干扰', () => {
		const container = fakeTarget();
		const memory = createScrollMemory(() => container.target);

		container.target.set(300);
		memory.save(1);
		container.target.set(900);
		memory.save(2);

		expect(memory.restore(1)).toBe(300);
		expect(memory.restore(2)).toBe(900);
	});

	it('容器未就绪时记录与恢复都不抛错', () => {
		const memory = createScrollMemory(() => null);
		expect(() => memory.save(1)).not.toThrow();
		expect(memory.restore(1)).toBe(0);
		expect(memory.reached(100)).toBe(true);
	});

	it('内容高度不足时判定为未到达，供逐帧重试', () => {
		const container = fakeTarget();
		const memory = createScrollMemory(() => container.target);

		// 离开时列表已经翻到第 4 页，位置在 1200
		container.target.set(1200);
		memory.save(1);

		// 回来时只渲染了第一页，容器落不到 1200
		container.setMax(200);
		container.target.set(0);

		memory.restore(1);
		expect(container.top).toBe(200);
		expect(memory.reached(1200)).toBe(false);

		// 加载更多后高度够了
		container.setMax(4000);
		memory.restore(1);
		expect(memory.reached(1200)).toBe(true);
	});
});
