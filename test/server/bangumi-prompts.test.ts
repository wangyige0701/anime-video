import { describe, expect, it } from 'vitest';
import {
	buildAlignMessages,
	buildMatchMessages,
	parseAlignResult,
	parseMatchResult,
} from '~server/src/integrations/bangumi/prompts';
import type { LocalSeasonSummary } from '~server/src/integrations/bangumi/prompts';
import { collectOfficialEpisodes } from '~server/src/integrations/bangumi/align';
import type { BangumiEpisode } from '~server/src/integrations/bangumi/types';

const seasons: LocalSeasonSummary[] = [
	{
		alias: 's1',
		relativePath: '无职转生/第1季',
		fileCount: 24,
		specialCount: 0,
		sampleFiles: ['01.mp4', '02.mp4', '24.mp4'],
	},
	{
		alias: 's2',
		relativePath: '无职转生/第2季',
		fileCount: 25,
		specialCount: 0,
		sampleFiles: ['00-特别篇.mp4', '01.mp4', '24.mp4'],
	},
];

const candidates = [
	{ id: 277554, name: '無職転生', nameCn: '无职转生', date: '2021-01-10', eps: 11 },
	{ id: 325585, name: '無職転生 第2部', nameCn: '无职转生 第2部分', date: '2021-10-03', eps: 12 },
];

describe('季映射提示词', () => {
	it('按紧凑数组构造，包含样例文件名', () => {
		const messages = buildMatchMessages('无职转生', seasons, candidates);
		expect(messages).toHaveLength(2);
		expect(messages[0]!.role).toBe('system');
		const payload = JSON.parse(messages[1]!.content.split('\n')[0]!);
		expect(payload.series).toBe('无职转生');
		expect(payload.seasons[0]).toEqual(['s1', '无职转生/第1季', 24, 0, ['01.mp4', '02.mp4', '24.mp4']]);
		expect(payload.candidates[0]).toEqual([277554, '無職転生', '无职转生', '2021-01-10', 11]);
	});
});

describe('季映射结果校验', () => {
	const allowed = [277554, 325585, 373247];

	it('正常结果按本地季顺序返回', () => {
		const result = parseMatchResult(
			{
				seasons: [
					{ alias: 's2', order: 2, subjectIds: [373247] },
					{ alias: 's1', order: 1, subjectIds: [277554, 325585] },
				],
				notes: '',
			},
			seasons,
			allowed,
		);
		expect(result.seasons.map((item) => item.alias)).toEqual(['s1', 's2']);
		expect(result.seasons[0]!.subjectIds).toEqual([277554, 325585]);
		expect(result.warnings).toEqual([]);
	});

	it('过滤候选外的 id 与重复分配的 id', () => {
		const result = parseMatchResult(
			{
				seasons: [
					{ alias: 's1', order: 1, subjectIds: [999999, 277554] },
					{ alias: 's2', order: 2, subjectIds: [277554] },
				],
			},
			seasons,
			allowed,
		);
		expect(result.seasons[0]!.subjectIds).toEqual([277554]);
		expect(result.seasons[1]!.subjectIds).toEqual([]);
		expect(result.warnings.some((warning) => warning.includes('不在候选列表中'))).toBe(true);
		expect(result.warnings.some((warning) => warning.includes('被同时分配'))).toBe(true);
	});

	it('未知别名被忽略，缺失的季给出告警', () => {
		const result = parseMatchResult(
			{ seasons: [{ alias: 's9', order: 1, subjectIds: [277554] }] },
			seasons,
			allowed,
		);
		expect(result.seasons.every((item) => item.subjectIds.length === 0)).toBe(true);
		expect(result.warnings.some((warning) => warning.includes('未知季别名'))).toBe(true);
		expect(result.warnings.filter((warning) => warning.includes('未匹配到条目'))).toHaveLength(2);
	});

	it('order 不是 1..N 排列时提示按目录顺序', () => {
		const result = parseMatchResult(
			{
				seasons: [
					{ alias: 's1', order: 1, subjectIds: [277554] },
					{ alias: 's2', order: 1, subjectIds: [373247] },
				],
			},
			seasons,
			allowed,
		);
		expect(result.warnings.some((warning) => warning.includes('order 1 重复'))).toBe(true);
		expect(result.warnings.some((warning) => warning.includes('不是 1..N 的完整排列'))).toBe(true);
	});

	it('超过 3 个条目时截断并告警', () => {
		const many = [1, 2, 3, 4];
		const result = parseMatchResult(
			{
				seasons: [
					{ alias: 's1', order: 1, subjectIds: many },
					{ alias: 's2', order: 2, subjectIds: [] },
				],
			},
			seasons,
			many,
		);
		expect(result.seasons[0]!.subjectIds).toHaveLength(3);
		expect(result.warnings.some((warning) => warning.includes('超过 3 个上限'))).toBe(true);
	});

	it('非对象输入不抛错，返回空映射与告警', () => {
		const result = parseMatchResult(null, seasons, allowed);
		expect(result.seasons.every((item) => item.subjectIds.length === 0)).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('集对齐提示词与结果校验', () => {
	const episode = (overrides: Partial<BangumiEpisode> & { id: number }): BangumiEpisode => ({
		subject_id: 1,
		type: 0,
		sort: overrides.id,
		ep: overrides.id,
		name: '',
		name_cn: '',
		airdate: '',
		duration: '',
		...overrides,
	});
	const official = collectOfficialEpisodes([
		{
			subjectId: 111,
			partIndex: 0,
			episodes: [
				episode({ id: 1, sort: 0, ep: 1, name_cn: '第0话' }),
				episode({ id: 2, sort: 1, ep: 2, name_cn: '第1话' }),
				episode({ id: 3, type: 1, sort: 2, ep: 0, name_cn: 'SP' }),
			],
		},
	]);
	const files = ['00-特别篇.mp4', '01.mp4', 'SP.mp4'];

	it('按 f/k 序号编码，本地集号解析不到时用 -1', () => {
		const messages = buildAlignMessages('无职转生/第2季', files, official, (fileName) =>
			fileName === '00-特别篇.mp4' ? 0 : fileName === '01.mp4' ? 1 : void 0,
		);
		const payload = JSON.parse(messages[1]!.content.split('\n')[0]!);
		expect(payload.localFiles).toEqual([
			['f1', '00-特别篇.mp4', 0],
			['f2', '01.mp4', 1],
			['f3', 'SP.mp4', -1],
		]);
		expect(payload.official[0]).toEqual(['k1', 0, '第0话']);
		expect(payload.official[2]).toEqual(['k3', 'sp', 2, 'SP']);
	});

	it('正常映射', () => {
		const result = parseAlignResult({ map: { f1: 'k1', f2: 'k2', f3: 'k3' }, reason: '' }, files, official);
		expect(result.map.get('00-特别篇.mp4')!.title).toBe('第0话');
		expect(result.map.get('00-特别篇.mp4')!.kind).toBe('main');
		expect(result.map.get('SP.mp4')!.kind).toBe('special');
		expect(result.warnings).toEqual([]);
	});

	it('官方集被重复分配时后来的文件视为无对应', () => {
		const result = parseAlignResult({ map: { f1: 'k1', f2: 'k1', f3: null } }, files, official);
		expect(result.map.get('00-特别篇.mp4')!.title).toBe('第0话');
		expect(result.map.get('01.mp4')).toBeNull();
		expect(result.warnings.some((warning) => warning.includes('重复分配'))).toBe(true);
	});

	it('指向不存在的官方集视为无对应', () => {
		const result = parseAlignResult({ map: { f1: 'k99', f2: null, f3: null } }, files, official);
		expect(result.map.get('00-特别篇.mp4')).toBeNull();
		expect(result.warnings.some((warning) => warning.includes('不存在的官方集'))).toBe(true);
	});

	it('漏掉的文件视为无对应并告警', () => {
		const result = parseAlignResult({ map: { f1: 'k1' } }, files, official);
		expect(result.map.get('01.mp4')).toBeNull();
		expect(result.warnings.some((warning) => warning.includes('未出现在 map'))).toBe(true);
	});

	it('没有 map 对象时返回空结果', () => {
		const result = parseAlignResult({ foo: 1 }, files, official);
		expect(result.map.size).toBe(0);
		expect(result.warnings[0]).toContain('未返回 map');
	});

	it('数组值表示 AI 判定为合并集，并采纳模型给出的合并标题', () => {
		const result = parseAlignResult(
			{
				map: { f1: ['k1', 'k2', 'k3'], f2: null, f3: null },
				titles: { f1: '  第0话／第1话／SP  ' },
			},
			files,
			official,
		);
		expect(result.merged.get('00-特别篇.mp4')!.map((item) => item.title)).toEqual(['第0话', '第1话', 'SP']);
		expect(result.titles.get('00-特别篇.mp4')).toBe('第0话／第1话／SP');
		expect(result.warnings).toEqual([]);
	});

	it('合并但没有可用标题时告警，不伪造标题', () => {
		const result = parseAlignResult(
			{ map: { f1: ['k1', 'k2'], f2: null, f3: null }, titles: { f1: '   ' } },
			files,
			official,
		);
		expect(result.merged.has('00-特别篇.mp4')).toBe(true);
		expect(result.titles.has('00-特别篇.mp4')).toBe(false);
		expect(result.warnings.some((warning) => warning.includes('没有可用的合并标题'))).toBe(true);
	});

	it('数组里重复指向同一集时整条按无对应处理', () => {
		const result = parseAlignResult({ map: { f1: ['k1', 'k1'], f2: 'k2', f3: 'k3' } }, files, official);
		expect(result.map.get('00-特别篇.mp4')).toBeNull();
		expect(result.merged.size).toBe(0);
		expect(result.map.get('01.mp4')!.title).toBe('第1话');
	});
});
