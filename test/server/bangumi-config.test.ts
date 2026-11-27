import { describe, expect, it } from 'vitest';
import { resolveBangumiConfig } from '~server/src/integrations/bangumi/config';
import { DEFAULT_SETTINGS, isBangumiConfigured } from '~server/src/settings/store';

const base = DEFAULT_SETTINGS.bangumi;

describe('Bangumi 服务配置', () => {
	it('默认设置原样解析', () => {
		expect(resolveBangumiConfig(base)).toEqual({
			baseUrl: 'https://api.bgm.tv',
			userAgent: 'anime-video/1.0',
			proxy: '',
			timeout: 15000,
		});
	});

	it('字符串去首尾空白，地址去掉末尾斜杠', () => {
		const config = resolveBangumiConfig({
			baseUrl: ' https://api.bgm.tv// ',
			userAgent: ' custom-agent ',
			proxy: ' http://127.0.0.1:7890 ',
			timeout: 3000,
		});
		expect(config).toEqual({
			baseUrl: 'https://api.bgm.tv',
			userAgent: 'custom-agent',
			proxy: 'http://127.0.0.1:7890',
			timeout: 3000,
		});
	});

	it('User-Agent 为空时回退内置标识', () => {
		// 手改 settings.json 把 UA 清空时不能让请求裸奔，Bangumi 会拒绝默认 UA
		expect(resolveBangumiConfig({ ...base, userAgent: '   ' }).userAgent).toBe('anime-video/1.0');
	});

	it('非法超时回退到默认值', () => {
		expect(resolveBangumiConfig({ ...base, timeout: 0 }).timeout).toBe(15000);
		expect(resolveBangumiConfig({ ...base, timeout: -5 }).timeout).toBe(15000);
		expect(resolveBangumiConfig({ ...base, timeout: Number.NaN }).timeout).toBe(15000);
	});

	it('地址为空时判定为未配置', () => {
		const withBase = (baseUrl: string) => ({
			...DEFAULT_SETTINGS,
			bangumi: { ...base, baseUrl },
		});
		expect(isBangumiConfigured(withBase(''))).toBe(false);
		expect(isBangumiConfigured(withBase('https://api.bgm.tv'))).toBe(true);
	});
});
