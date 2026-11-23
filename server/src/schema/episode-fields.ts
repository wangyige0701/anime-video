import { z } from 'zod';

/**
 * 集字段写入参数。
 *
 * 标题允许为空：空标题表示恢复默认标题（文件名去掉扩展名），由数据层归一化。
 */

export const episodeTitleSchema = z.object({
	title: z.string().trim(),
});

export const episodeSortSchema = z.object({
	sort: z.number().int().min(1, '排序必须从 1 开始'),
});
