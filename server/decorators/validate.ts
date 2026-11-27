import { createMiddlewareDecorator } from 'koa-use-decorator-router';
import z from 'zod';
import { Status } from '~shared/http-status';
import { Response } from '~server/middlewares/response';
import { ApiError } from '~server/src/error';

/** 只取校验结果里真正用得到的两项，不绑定 zod 的内部类型 */
interface ValidationIssue {
	path: readonly PropertyKey[];
	message: string;
}

/**
 * 校验失败文案：取第一条问题，前面带上字段路径。
 *
 * `ZodError.message` 是整段 issues 的 JSON 字符串，直接当响应体的 `message`，
 * 设置页保存一个非法地址就会弹出几十行 JSON。这里只留第一条可读信息，
 * 路径用点号拼接（`ai.baseUrl：必须是 http(s) 地址`），字段名与接口入参一致，便于定位。
 */
export function formatValidationMessage(issues: readonly ValidationIssue[]) {
	const [first] = issues;
	if (!first) {
		return '请求参数不合法';
	}

	const path = first.path.map(String).join('.');
	return path ? `${path}：${first.message}` : first.message;
}

/**
 * 验证请求体是否符合指定的 Zod 模式
 */
export function Validate(getSchema: (zod: typeof z) => z.ZodSchema) {
	const schema = getSchema(z);
	return createMiddlewareDecorator(async (ctx, next) => {
		const body = ctx.request.body;
		const result = schema.safeParse(body);
		if (!result.success) {
			const message = formatValidationMessage(result.error.issues);
			throw new ApiError(Status.Failed, new Response(null, Status.Failed, false, message));
		}

		ctx.request.body = result.data as any;

		await next();
	})();
}
