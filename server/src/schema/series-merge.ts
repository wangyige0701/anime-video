import { z } from 'zod';

/**
 * 合并参数。
 *
 * 只接受被并入的系列 id；主系列由路径参数指定。系列是否存在、是否成环、
 * 是否已被别的组合并属于关系约束，不在参数模式里判断，交给数据层统一校验。
 */
export const seriesMergeSchema = z.object({
	memberId: z.string().trim().min(1, '被合并的系列 id 不能为空'),
});

/**
 * 合并组的季顺序。
 *
 * 接收**完整顺序**而不是位置号：跨系列拖动无法表达成「移动到第 N 位」。
 * 是否属于当前合并组由数据层判断（需要实例），这里只保证数组元素是非空字符串；
 * 空数组合法，表示清空显式顺序、回到默认顺序。
 */
export const mergedSeasonOrderSchema = z.object({
	seasonIds: z.array(z.string().trim().min(1, '季 id 不能为空')),
});

/** 合并组的图片顺序，元素为图片绝对路径；空数组表示清空显式顺序 */
export const mergedImageOrderSchema = z.object({
	images: z.array(z.string().trim().min(1, '图片路径不能为空')),
});
