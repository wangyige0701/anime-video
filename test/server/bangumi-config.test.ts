import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBangumiConfig } from '~server/src/integrations/bangumi/config';
import { parseEnvText } from '~server/src/integrations/env';
import type { AppConfig } from '~shared/config';

const defaults = {
	baseUrl: 'https://api.bgm.tv',
	userAgent: 'anime-video/1.0',
	proxy: '',
	timeout: 15000,
} satisfies AppConfig['bangumi'];

describe('Bangumi 服务配置', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('没有任何覆盖时使用 config.yaml 默认值', () => {
		const config = resolveBangumiConfig(defaults, {});
		expect(config).toEqual(defaults);
	});

	it('.env 覆盖默认值，且兼容调试脚本的 BGM_ 前缀', () => {
		const config = resolveBangumiConfig(defaults, {
			BGM_PROXY: 'http://127.0.0.1:7890',
			BGM_USER_AGENT: 'custom-agent',
		});
		expect(config.proxy).toBe('http://127.0.0.1:7890');
		expect(config.userAgent).toBe('custom-agent');
	});

	it('进程环境变量优先于 .env', () => {
		vi.stubEnv('BANGUMI_BASE_URL', 'https://process-bgm');
		const config = resolveBangumiConfig(defaults, {
			BGM_BASE_URL: 'https://file-bgm',
			BANGUMI_BASE_URL: 'https://file-bgm-2',
		});
		expect(config.baseUrl).toBe('https://process-bgm');
	});

	it('空串与纯空白视为未配置', () => {
		vi.stubEnv('BANGUMI_PROXY', '   ');
		const config = resolveBangumiConfig(defaults, { BANGUMI_PROXY: '', BANGUMI_USER_AGENT: '  ' });
		expect(config.proxy).toBe('');
		expect(config.userAgent).toBe(defaults.userAgent);
	});

	it('非法超时回退到默认值', () => {
		expect(resolveBangumiConfig(defaults, { BANGUMI_TIMEOUT: 'abc' }).timeout).toBe(15000);
		expect(resolveBangumiConfig(defaults, { BANGUMI_TIMEOUT: '-5' }).timeout).toBe(15000);
		expect(resolveBangumiConfig(defaults, { BANGUMI_TIMEOUT: '3000' }).timeout).toBe(3000);
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
