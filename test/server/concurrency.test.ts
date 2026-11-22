import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../server/src/utils/concurrency';

/** 构造一个可控延迟的异步任务 */
function delayResolve<T>(value: T, ms: number) {
	return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
}

describe('mapWithConcurrency', () => {
	it('结果顺序与入参顺序一致，即使后完成的任务先开始', async () => {
		const result = await mapWithConcurrency([30, 10, 20], 3, (ms, index) => delayResolve(`item-${index}`, ms));
		expect(result).toEqual(['item-0', 'item-1', 'item-2']);
	});

	it('并发数不会超过上限', async () => {
		let running = 0;
		let peak = 0;
		await mapWithConcurrency(
			Array.from({ length: 10 }, (_, index) => index),
			3,
			async () => {
				running++;
				peak = Math.max(peak, running);
				await delayResolve(null, 5);
				running--;
				return null;
			},
		);
		expect(peak).toBe(3);
	});

	it('空数组直接返回空结果', async () => {
		await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
	});

	it('并发上限大于任务数时不会创建多余协程', async () => {
		const result = await mapWithConcurrency([1, 2], 8, async (value) => value * 2);
		expect(result).toEqual([2, 4]);
	});

	it('非法并发上限抛出错误', async () => {
		await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow('并发上限必须是大于 0 的整数');
		await expect(mapWithConcurrency([1], Number.NaN, async () => 1)).rejects.toThrow();
	});

	it('任务抛错时整体 reject，并停止领取新任务', async () => {
		let started = 0;
		await expect(
			mapWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (value) => {
				started++;
				if (value === 3) {
					throw new Error('boom');
				}
				return value;
			}),
		).rejects.toThrow('boom');
		// 串行上限 1 时，第 3 个任务抛出后不会再执行第 4 个
		expect(started).toBe(3);
	});
});
