import { describe, expect, it } from 'vitest';
import { formatValidationMessage } from '~server/decorators/validate';
import { settingsUpdateSchema } from '~server/src/schema/settings';

/** 用真实模式产出 issues，避免测试捏造的字段路径与线上不一致 */
function messageOf(body: unknown) {
	const result = settingsUpdateSchema.safeParse(body);
	expect(result.success).toBe(false);
	return formatValidationMessage(result.success ? [] : result.error.issues);
}

describe('formatValidationMessage', () => {
	it('带字段路径与中文原因', () => {
		expect(messageOf({ ai: { baseUrl: 'not-a-url' } })).toBe('ai.baseUrl：必须是 http(s) 地址');
	});

	it('嵌套字段路径用点号拼接', () => {
		expect(messageOf({ bangumi: { userAgent: '' } })).toBe('bangumi.userAgent：User-Agent 不能为空');
	});

	it('超时越界用中文提示，不露出 Zod 默认英文', () => {
		expect(messageOf({ ai: { timeout: 10 } })).toBe('ai.timeout：超时不能小于 1000 毫秒');
		expect(messageOf({ ai: { timeout: 300001 } })).toBe('ai.timeout：超时不能大于 300000 毫秒');
	});

	it('不再把整段 issues 的 JSON 当作消息', () => {
		expect(messageOf({ ai: { timeout: '60000' } })).not.toContain('"code"');
	});

	it('没有字段路径时只回原因', () => {
		expect(formatValidationMessage([{ path: [], message: '请求体不能为空' }])).toBe('请求体不能为空');
	});

	it('没有问题时给兜底文案', () => {
		expect(formatValidationMessage([])).toBe('请求参数不合法');
	});
});
