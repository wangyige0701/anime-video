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
