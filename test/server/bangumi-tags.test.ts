import { describe, expect, it } from 'vitest';
import { buildTagMessages, matchTagsByRules, parseTagResult } from '~server/src/integrations/bangumi/tags';
import { seriesTypes } from '~shared/series-types';

const types = seriesTypes.slice(0, 12).map((type) => ({ id: type.id, name: type.name }));

describe('标签规则匹配', () => {
	it('同名标签直接命中，按类型表顺序返回', () => {
		const result = matchTagsByRules(['小说改', 'TV', '日本'], types);
		expect(result.unmatched).toEqual([]);
		expect(result.types).toEqual(
			types.filter((type) => ['TV', '日本', '小说改'].includes(type.name)).map((type) => type.id),
		);
	});

	it('忽略空白与大小写差异', () => {
		const result = matchTagsByRules([' tv ', 'ＴＶ'.toLowerCase()], types);
		expect(result.types).toHaveLength(1);
	});

	it('制作公司与季度标签不命中规则', () => {
		const result = matchTagsByRules(['StudioBind', '2026年7月'], types);
		expect(result.types).toEqual([]);
		expect(result.unmatched).toEqual(['StudioBind', '2026年7月']);
	});

	it('重复标签只计一次', () => {
		const result = matchTagsByRules(['TV', 'TV'], types);
		expect(result.types).toHaveLength(1);
	});

	it('空输入返回空结果', () => {
		expect(matchTagsByRules([], types)).toEqual({ types: [], unmatched: [] });
	});
});

describe('标签映射提示词', () => {
	it('把标签与类型表一起传给模型', () => {
		const messages = buildTagMessages(['异世界', 'StudioBind'], types);
		const payload = JSON.parse(messages[1]!.content.split('\n')[0]!);
		expect(payload.tags).toEqual(['异世界', 'StudioBind']);
		expect(payload.types[0]).toEqual([types[0]!.id, types[0]!.name]);
	});
});

describe('标签映射结果校验', () => {
	const knownTags = ['异世界', 'StudioBind'];

	it('接受有效映射并按类型表顺序返回', () => {
		const fantasy = types.find((type) => type.name === '奇幻')!;
		const result = parseTagResult(
			{ map: [{ tag: '异世界', id: fantasy.id }], ignored: ['StudioBind'] },
			types,
			knownTags,
		);
		expect(result.types).toEqual([fantasy.id]);
		expect(result.ignored).toEqual(['StudioBind']);
		expect(result.warnings).toEqual([]);
	});

	it('拒绝未提供的标签与不存在的类型', () => {
		const result = parseTagResult(
			{
				map: [
					{ tag: '不存在的标签', id: 1 },
					{ tag: '异世界', id: 9999 },
				],
			},
			types,
			knownTags,
		);
		expect(result.types).toEqual([]);
		expect(result.warnings).toHaveLength(2);
	});

	it('多个标签映射到同一类型时去重', () => {
		const fantasy = types.find((type) => type.name === '奇幻')!;
		const result = parseTagResult(
			{
				map: [
					{ tag: '异世界', id: fantasy.id },
					{ tag: 'StudioBind', id: fantasy.id },
				],
			},
			types,
			knownTags,
		);
		expect(result.types).toEqual([fantasy.id]);
	});

	it('非数组输入返回空结果', () => {
		expect(parseTagResult({}, types, knownTags)).toEqual({ types: [], ignored: [], warnings: [] });
	});
});
