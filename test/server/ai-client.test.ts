import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSettingsCache, updateSettings } from '~server/src/settings/store';

const mocks = vi.hoisted(() => ({ requestJsonWithRetry: vi.fn() }));

vi.mock('~server/src/integrations/http', () => ({
	requestJsonWithRetry: mocks.requestJsonWithRetry,
}));

const { chatJson, extractJsonObject } = await import('~server/src/integrations/ai/client');

function ok(content: string) {
	return {
		status: 200,
		headers: {},
		raw: '',
		data: { choices: [{ message: { content } }], usage: { total_tokens: 42 } },
	};
}

let directory: string;

describe('AI 客户端', () => {
	beforeEach(async () => {
		// 每个用例独立的设置文件：不让开发机已保存的凭据渗进断言
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'anime-ai-client-'));
		process.env.ANIME_VIDEO_DATA_DIR = directory;
		clearSettingsCache();
		await updateSettings({
			ai: { baseUrl: 'https://ai.test/v1', apiKey: 'test-key', model: 'test-model' },
		});
		mocks.requestJsonWithRetry.mockReset();
	});

	afterEach(async () => {
		clearSettingsCache();
		delete process.env.ANIME_VIDEO_DATA_DIR;
		await fs.rm(directory, { recursive: true, force: true });
	});

	it('请求 chat/completions 并返回内容与用量', async () => {
		mocks.requestJsonWithRetry.mockResolvedValue(ok('{"a":1}'));
		const result = await chatJson([{ role: 'user', content: 'hi' }]);
		expect(result.content).toBe('{"a":1}');
		expect(result.usage).toEqual({ total_tokens: 42 });

		const [url, options] = mocks.requestJsonWithRetry.mock.calls[0]!;
		expect(url).toBe('https://ai.test/v1/chat/completions');
		expect(options.method).toBe('POST');
		expect(options.headers.Authorization).toBe('Bearer test-key');
		expect(options.body).toMatchObject({
			model: 'test-model',
			temperature: 0,
			response_format: { type: 'json_object' },
			thinking: { type: 'disabled' },
		});
	});

	it('接口拒绝 thinking 参数时剥离后重试', async () => {
		mocks.requestJsonWithRetry
			.mockResolvedValueOnce({ status: 400, headers: {}, raw: 'unsupported thinking', data: undefined })
			.mockResolvedValueOnce(ok('{"a":1}'));
		const result = await chatJson([{ role: 'user', content: 'hi' }]);
		expect(result.content).toBe('{"a":1}');
		expect(mocks.requestJsonWithRetry).toHaveBeenCalledTimes(2);
		expect(mocks.requestJsonWithRetry.mock.calls[1]![1].body).not.toHaveProperty('thinking');
	});

	it('接口同时拒绝 response_format 时继续剥离', async () => {
		mocks.requestJsonWithRetry
			.mockResolvedValueOnce({ status: 400, headers: {}, raw: 'bad thinking', data: undefined })
			.mockResolvedValueOnce({ status: 400, headers: {}, raw: 'bad response_format', data: undefined })
			.mockResolvedValueOnce(ok('{"a":1}'));
		const result = await chatJson([{ role: 'user', content: 'hi' }]);
		expect(result.content).toBe('{"a":1}');
		const lastBody = mocks.requestJsonWithRetry.mock.calls[2]![1].body;
		expect(lastBody).not.toHaveProperty('thinking');
		expect(lastBody).not.toHaveProperty('response_format');
	});

	it('返回内容为空时报错', async () => {
		mocks.requestJsonWithRetry.mockResolvedValue(ok('   '));
		await expect(chatJson([{ role: 'user', content: 'hi' }])).rejects.toThrow('AI 返回内容为空');
	});

	it('配置缺失时直接拒绝，不发出请求', async () => {
		// 清空地址即视为未配置：不能把「没填设置」表现成必然失败的 401
		await updateSettings({ ai: { baseUrl: '' } });
		await expect(chatJson([{ role: 'user', content: 'hi' }])).rejects.toThrow(/未配置 AI 接口/);
		expect(mocks.requestJsonWithRetry).not.toHaveBeenCalled();
	});

	it('错误信息提示去设置页填写', async () => {
		await updateSettings({ ai: { apiKey: '' } });
		await expect(chatJson([{ role: 'user', content: 'hi' }])).rejects.toThrow(/设置/);
	});

	it('错误信息不包含密钥', async () => {
		mocks.requestJsonWithRetry.mockResolvedValue({
			status: 401,
			headers: {},
			raw: 'unauthorized',
			data: void 0,
		});
		await expect(chatJson([{ role: 'user', content: 'hi' }])).rejects.toThrow(/HTTP 401/);
		try {
			await chatJson([{ role: 'user', content: 'hi' }]);
		} catch (error) {
			expect(String(error)).not.toContain('test-key');
		}
	});
});

describe('解析模型输出中的 JSON', () => {
	it('裸 JSON', () => {
		expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
	});

	it('代码块包裹', () => {
		expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
	});

	it('前后夹带说明', () => {
		expect(extractJsonObject('结果是：{"a":1} 以上')).toEqual({ a: 1 });
	});

	it('无法解析时抛出可读错误', () => {
		expect(() => extractJsonObject('没有 JSON')).toThrow(/无法解析为 JSON/);
	});
});
