import { isNumber } from '@wang-yige/utils';

/**
 * 把「年 / 月」元组转成 `Date`。
 *
 * `el-date-picker-panel` 只认 `Date`（内部再转 dayjs）。直接把 `[年, 月]` 元组传进去，
 * dayjs 会拿到一个数组并解析成 Invalid Date：面板拿不到当前值，
 * 选中的月份不会高亮，打开时也不会定位到记录的年月。
 *
 * 年、月缺失或越界（清空后的占位状态、脏数据）返回 `undefined`，让面板回落到默认视图。
 */
export function toMonthDate(value: [number?, number?]): Date | undefined {
	const [year, month] = value;
	if (!isNumber(year) || !isNumber(month) || year <= 0 || month < 1 || month > 12) {
		return void 0;
	}
	return new Date(year, month - 1, 1);
}
