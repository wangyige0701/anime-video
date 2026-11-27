import { z } from 'zod';
import { isWritableSeriesStatus } from '~shared/series-status';
import { seriesTypes } from '~shared/series-types';

/**
 * Bangumi 同步接口参数。
 *
 * 结构与 `src/integrations/bangumi/sync.ts` 的 `SeasonMappingInput` / `ApplyInput` 一一对应；
 * 这里只做形状与范围校验，归属校验（季/集是否属于该系列）在编排层完成，因为需要读数据层。
 */
const minSeriesType = seriesTypes[0]!.id;
const maxSeriesType = seriesTypes[seriesTypes.length - 1]!.id;

export const bangumiPreviewSchema = z.object({
	seasons: z
		.array(
			z.object({
				seasonId: z.string().min(1),
				// 一个季最多由三个条目拼成（split cour），与提示词的上限一致
				subjectIds: z.array(z.number().int().positive()).max(3),
			}),
		)
		.min(1),
});

export const bangumiApplySchema = z.object({
	series: z
		.object({
			title: z.string().trim().min(1).max(200).optional(),
			description: z.string().trim().max(5000).optional(),
			date: z
				.union([
					z.object({
						year: z.number().int().min(1900).max(9999),
						month: z.number().int().min(1).max(12),
					}),
					z.null(),
				])
				.optional(),
			status: z.number().int().refine(isWritableSeriesStatus, '系列状态无效').optional(),
			types: z.array(z.number().int().min(minSeriesType).max(maxSeriesType)).optional(),
		})
		.optional(),
	seasons: z
		.array(
			z.object({
				seasonId: z.string().min(1),
				title: z.string().trim().min(1).max(200).optional(),
				// 排序数组必须是该季全部集的 id 排列，长度与归属在编排层校验
				order: z.array(z.string().min(1)).optional(),
				episodes: z
					.array(
						z.object({
							episodeId: z.string().min(1),
							title: z.string().trim().min(1).max(300),
						}),
					)
					.optional(),
			}),
		)
		.optional(),
});
