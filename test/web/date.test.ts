import { describe, expect, it } from 'vitest';
import { toMonthDate } from '../../web/src/utils/date';

describe('toMonthDate', () => {
	it('转成当月 1 号的 Date，月份从 1 开始', () => {
		const date = toMonthDate([2026, 10]);
		expect(date).toBeInstanceOf(Date);
		expect(date?.getFullYear()).toBe(2026);
		// 十月对应 Date 的 9
		expect(date?.getMonth()).toBe(9);
		expect(date?.getDate()).toBe(1);
	});

	it('一月不会算成上一年的十二月', () => {
		const date = toMonthDate([2026, 1]);
		expect(date?.getFullYear()).toBe(2026);
		expect(date?.getMonth()).toBe(0);
	});

	it('清空后的占位状态返回 undefined', () => {
		expect(toMonthDate([])).toBeUndefined();
		expect(toMonthDate([2026])).toBeUndefined();
		expect(toMonthDate([undefined, 10])).toBeUndefined();
	});

	it('越界的年月当作缺失处理，不产出 Invalid Date', () => {
		expect(toMonthDate([0, 0])).toBeUndefined();
		expect(toMonthDate([2026, 0])).toBeUndefined();
		expect(toMonthDate([2026, 13])).toBeUndefined();
		expect(toMonthDate([-1, 10])).toBeUndefined();
	});
});
