import { describe, expect, it } from 'vitest';
import { resolveAiConfig } from '~server/src/integrations/ai/config';
import { DEFAULT_SETTINGS, isAiConfigured } from '~server/src/settings/store';

const base = DEFAULT_SETTINGS.ai;

describe('AI 服务配置', () => {
	it('缺省设置解析为空配置与默认超时', () => {
		expect(resolveAiConfig(base)).toEqual({
			baseUrl: '',
			apiKey: '',
			model: '',
			proxy: '',
			timeout: 60000,
		});
	});

	it('字符串去首尾空白，地址去掉末尾斜杠', () => {
		const config = resolveAiConfig({
			baseUrl: '  https://api.deepseek.com/v1/// ',
			apiKey: ' sk-test ',
			model: ' deepseek-chat ',
			proxy: ' http://127.0.0.1:7891 ',
			timeout: 30000,
		});
		expect(config).toEqual({
			baseUrl: 'https://api.deepseek.com/v1',
			apiKey: 'sk-test',
			model: 'deepseek-chat',
			proxy: 'http://127.0.0.1:7891',
			timeout: 30000,
		});
	});

	it('非法超时回退默认值', () => {
		expect(resolveAiConfig({ ...base, timeout: 0 }).timeout).toBe(60000);
		expect(resolveAiConfig({ ...base, timeout: -5 }).timeout).toBe(60000);
		expect(resolveAiConfig({ ...base, timeout: Number.NaN }).timeout).toBe(60000);
	});

	it('代理只取 AI 自己的设置，不继承 Bangumi', () => {
		// Bangumi 的代理在另一个配置块里，AI 侧只认自己的 proxy 字段
		expect(resolveAiConfig(base).proxy).toBe('');
	});

	it('配置不完整时判定为不可用', () => {
		const withAi = (ai: Partial<typeof base>) => ({ ...DEFAULT_SETTINGS, ai: { ...base, ...ai } });
		expect(isAiConfigured(DEFAULT_SETTINGS)).toBe(false);
		expect(isAiConfigured(withAi({ baseUrl: 'https://x/v1', apiKey: 'k' }))).toBe(false);
		expect(isAiConfigured(withAi({ baseUrl: 'https://x/v1', model: 'm' }))).toBe(false);
		expect(isAiConfigured(withAi({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }))).toBe(true);
	});
});
