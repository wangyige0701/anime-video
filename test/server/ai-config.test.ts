import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAiConfigured, resolveAiConfig } from '~server/src/integrations/ai/config';
import type { AppConfig } from '~shared/config';

const defaults = {
	baseUrl: '',
	apiKey: '',
	model: '',
	proxy: '',
	timeout: 60000,
} satisfies AppConfig['ai'];

describe('AI 服务配置', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('.env 覆盖默认值', () => {
		const config = resolveAiConfig(defaults, {
			AI_BASE_URL: 'https://example.com/v1',
			AI_API_KEY: 'test-key',
			AI_MODEL: 'test-model',
			AI_PROXY: 'http://127.0.0.1:7891',
		});
		expect(config.baseUrl).toBe('https://example.com/v1');
		expect(config.model).toBe('test-model');
		expect(config.proxy).toBe('http://127.0.0.1:7891');
	});

	it('AI 代理不复用 Bangumi 的代理变量', () => {
		const config = resolveAiConfig(defaults, {
			BGM_PROXY: 'http://127.0.0.1:7890',
			BANGUMI_PROXY: 'http://127.0.0.1:7892',
		});
		expect(config.proxy).toBe('');
	});

	it('进程环境变量优先于 .env', () => {
		vi.stubEnv('AI_MODEL', 'process-model');
		expect(resolveAiConfig(defaults, { AI_MODEL: 'file-model' }).model).toBe('process-model');
	});

	it('配置不完整时判定为不可用', () => {
		expect(isAiConfigured({ ...defaults })).toBe(false);
		expect(isAiConfigured({ ...defaults, baseUrl: 'https://x/v1', apiKey: 'k' })).toBe(false);
		expect(isAiConfigured({ ...defaults, baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })).toBe(true);
	});
});
