import { z } from 'zod';
import { isWritableSeriesStatus } from '~shared/series-status';

/**
 * 系列字段写入参数。
 *
 * 独立于控制器，便于直接单测；字符串统一去首尾空白。
 */

export const seriesTitleSchema = z.object({
	// 空标题是合法输入，表示恢复默认标题（系列目录名）。
	title: z.string().trim(),
});

export const seriesDescriptionSchema = z.object({
	description: z.string().trim(),
});

export const seriesDateSchema = z.object({
	year: z.number().int().min(1900, '年份不能早于 1900').max(9999, '年份不能晚于 9999'),
	month: z.number().int().min(1, '月份范围是 1-12').max(12, '月份范围是 1-12'),
});

export const seriesStatusSchema = z.object({
	// 「全部」只是筛选选项，不是系列状态，写入时按可写状态集合校验。
	status: z.number().int().refine(isWritableSeriesStatus, '系列状态无效'),
});
