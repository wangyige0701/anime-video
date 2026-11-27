import { describe, expect, it } from 'vitest';
import type { SettingsView } from '../../web/src/api/settings';
import {
	aiFormFrom,
	bangumiFormFrom,
	buildAiPatch,
	buildBangumiPatch,
	type ApiKeyIntent,
} from '../../web/src/utils/settings';

const view: SettingsView = {
	ai: {
		baseUrl: 'https://api.deepseek.com/v1',
		model: 'deepseek-chat',
		proxy: '',
		timeout: 60000,
		hasApiKey: true,
		apiKeyMasked: '****abcd',
		configured: true,
	},
	bangumi: {
		baseUrl: 'https://api.bgm.tv',
		userAgent: 'anime-video/1.0',
		proxy: '',
		timeout: 15000,
		configured: true,
	},
	syncAvailable: true,
};

const keep: ApiKeyIntent = { type: 'keep' };

function aiPatch(overrides: Partial<ReturnType<typeof aiFormFrom>>, apiKey: ApiKeyIntent = keep) {
	return buildAiPatch(view, { ...aiFormFrom(view), ...overrides }, apiKey);
}

function bangumiPatch(overrides: Partial<ReturnType<typeof bangumiFormFrom>>) {
	return buildBangumiPatch(view, { ...bangumiFormFrom(view), ...overrides });
}

describe('AI 设置补丁', () => {
	it('没有改动时返回空补丁', () => {
		expect(aiPatch({})).toEqual({});
	});

	it('只提交变化的字段，且去掉首尾空白', () => {
		expect(aiPatch({ baseUrl: '  https://new.example.com/v1  ', model: 'deepseek-chat' })).toEqual({
			baseUrl: 'https://new.example.com/v1',
		});
	});

	it('空白差异不算改动', () => {
		expect(aiPatch({ model: ' deepseek-chat ' })).toEqual({});
	});

	it('清空地址会作为空字符串提交', () => {
		// 地址为空等于关闭 AI 功能，属于合法状态，不能被前端吞掉
		expect(aiPatch({ baseUrl: '   ' })).toEqual({ baseUrl: '' });
	});

	it('保留密钥时不提交 apiKey', () => {
		expect(aiPatch({}, { type: 'keep' })).toEqual({});
	});

	it('替换密钥提交去空白后的新值', () => {
		expect(aiPatch({}, { type: 'replace', value: '  sk-new-key  ' })).toEqual({ apiKey: 'sk-new-key' });
	});

	it('点了替换但没填时不提交，避免误清空', () => {
		expect(aiPatch({}, { type: 'replace', value: '   ' })).toEqual({});
	});

	it('清除密钥提交空字符串', () => {
		expect(aiPatch({}, { type: 'clear' })).toEqual({ apiKey: '' });
	});

	it('视图为空时不产生补丁', () => {
		// 首次加载失败时不能把空字符串当成「用户清空了配置」提交上去
		expect(buildAiPatch(null, aiFormFrom(null), { type: 'clear' })).toEqual({});
	});
});

describe('Bangumi 设置补丁', () => {
	it('没有改动时返回空补丁', () => {
		expect(bangumiPatch({})).toEqual({});
	});

	it('只提交变化的字段', () => {
		expect(bangumiPatch({ userAgent: ' anime-video/1.1 ', timeout: 20000 })).toEqual({
			userAgent: 'anime-video/1.1',
			timeout: 20000,
		});
	});

	it('空白差异不算改动', () => {
		expect(bangumiPatch({ userAgent: ' anime-video/1.0 ' })).toEqual({});
	});

	it('地址清空会作为空字符串提交，由服务端判定为未配置', () => {
		expect(bangumiPatch({ baseUrl: '' })).toEqual({ baseUrl: '' });
	});

	it('视图为空时不产生补丁', () => {
		expect(buildBangumiPatch(null, bangumiFormFrom(null))).toEqual({});
	});
});
