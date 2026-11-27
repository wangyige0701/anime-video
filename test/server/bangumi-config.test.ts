import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAiConfigured, parseEnvText, resolveServiceConfig } from '~server/src/integrations/bangumi/config';
import type { AppConfig } from '~shared/config';

const defaults = {
	bangumi: {
		baseUrl: 'https://api.bgm.tv',
		userAgent: 'anime-video/1.0',
		proxy: '',
		timeout: 15000,
	},
	ai: {
		baseUrl: '',
		apiKey: '',
		model: '',
		proxy: '',
		timeout: 60000,
	},
} as unknown as AppConfig;

describe('Bangumi 服务配置', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('没有任何覆盖时使用 config.yaml 默认值', () => {
		const config = resolveServiceConfig(defaults, {});
		expect(config.bangumi.baseUrl).toBe('https://api.bgm.tv');
		expect(config.bangumi.userAgent).toBe('anime-video/1.0');
		expect(config.bangumi.proxy).toBe('');
		expect(config.bangumi.timeout).toBe(15000);
		expect(config.ai.baseUrl).toBe('');
	});

	it('.env 覆盖默认值，且兼容 BGM_ 前缀', () => {
		const config = resolveServiceConfig(defaults, {
			AI_BASE_URL: 'https://example.com/v1',
			AI_API_KEY: 'test-key',
			AI_MODEL: 'test-model',
			AI_PROXY: 'http://127.0.0.1:7891',
			BGM_PROXY: 'http://127.0.0.1:7890',
			BGM_USER_AGENT: 'custom-agent',
		});
		expect(config.ai.baseUrl).toBe('https://example.com/v1');
		expect(config.ai.proxy).toBe('http://127.0.0.1:7891');
		expect(config.bangumi.proxy).toBe('http://127.0.0.1:7890');
		expect(config.bangumi.userAgent).toBe('custom-agent');
		// AI 代理不继承 Bangumi 代理
		expect(config.ai.proxy).not.toBe(config.bangumi.proxy);
	});

	it('进程环境变量优先于 .env', () => {
		vi.stubEnv('AI_BASE_URL', 'https://from-process/v1');
		vi.stubEnv('BANGUMI_BASE_URL', 'https://process-bgm');
		const config = resolveServiceConfig(defaults, {
			AI_BASE_URL: 'https://from-file/v1',
			BGM_BASE_URL: 'https://file-bgm',
		});
		expect(config.ai.baseUrl).toBe('https://from-process/v1');
		expect(config.bangumi.baseUrl).toBe('https://process-bgm');
	});

	it('空串与纯空白视为未配置', () => {
		vi.stubEnv('AI_BASE_URL', '   ');
		const config = resolveServiceConfig(defaults, { AI_BASE_URL: '', AI_MODEL: '  ' });
		expect(config.ai.baseUrl).toBe('');
		expect(config.ai.model).toBe('');
	});

	it('非法超时回退到默认值', () => {
		const config = resolveServiceConfig(defaults, { BANGUMI_TIMEOUT: 'abc', AI_TIMEOUT: '-5' });
		expect(config.bangumi.timeout).toBe(15000);
		expect(config.ai.timeout).toBe(60000);
	});

	it('AI 配置不完整时判定为不可用', () => {
		expect(isAiConfigured({ baseUrl: '', apiKey: '', model: '', proxy: '', timeout: 1 })).toBe(false);
		expect(isAiConfigured({ baseUrl: 'https://x/v1', apiKey: 'k', model: '', proxy: '', timeout: 1 })).toBe(false);
		expect(isAiConfigured({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', proxy: '', timeout: 1 })).toBe(true);
	});
});

describe('解析 .env 文本', () => {
	it('支持 export、注释与成对引号', () => {
		const env = parseEnvText(
			[
				'# 注释行',
				'AI_BASE_URL=https://example.com/v1 # 行尾注释',
				'export AI_MODEL="gpt-test # 引号内的井号保留"',
				"AI_API_KEY='sk-test'",
				'EMPTY=',
			].join('\n'),
		);
		expect(env.AI_BASE_URL).toBe('https://example.com/v1');
		expect(env.AI_MODEL).toBe('gpt-test # 引号内的井号保留');
		expect(env.AI_API_KEY).toBe('sk-test');
		expect(env.EMPTY).toBe('');
	});

	it('忽略无法解析的行', () => {
		expect(parseEnvText('没有等号\n1INVALID=x\nGOOD=1')).toEqual({ GOOD: '1' });
	});
});
