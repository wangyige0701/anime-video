import { z } from 'zod';

/**
 * 用户设置接口参数。
 *
 * 所有字段可选：缺省表示不修改；空字符串表示清空。密钥的清空必须是显式动作，
 * 不跟随「空值恢复默认」的既有约定，避免用户清空输入框后误删已保存的凭据。
 */
const httpUrl = z
	.string()
	.trim()
	.max(500)
	.refine((value) => value === '' || /^https?:\/\//i.test(value), '必须是 http(s) 地址');

const proxy = z
	.string()
	.trim()
	.max(500)
	.refine((value) => value === '' || /^https?:\/\//i.test(value), '代理必须是 http(s) 地址');

const timeout = z.number().int().min(1000).max(300000);

export const settingsUpdateSchema = z
	.object({
		ai: z
			.object({
				baseUrl: httpUrl.optional(),
				apiKey: z.string().trim().max(500).optional(),
				model: z.string().trim().max(200).optional(),
				proxy: proxy.optional(),
				timeout: timeout.optional(),
			})
			.strict()
			.optional(),
		bangumi: z
			.object({
				baseUrl: httpUrl.optional(),
				userAgent: z.string().trim().min(1, 'User-Agent 不能为空').max(300).optional(),
				proxy: proxy.optional(),
				timeout: timeout.optional(),
			})
			.strict()
			.optional(),
	})
	.strict();
