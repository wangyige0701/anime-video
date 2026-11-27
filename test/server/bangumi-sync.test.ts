import { describe, expect, it } from 'vitest';
import {
	buildSeasonPreview,
	deriveStatus,
	normalizeCandidates,
	normalizeSeasonTitle,
	orderSubjects,
	parseDate,
	stripSummary,
	summarizeSeason,
	validateOrder,
} from '~server/src/integrations/bangumi/sync';
import type { LocalSeasonInput } from '~server/src/integrations/bangumi/sync';
import { collectOfficialEpisodes } from '~server/src/integrations/bangumi/align';
import type { BangumiEpisode } from '~server/src/integrations/bangumi/types';

function episode(overrides: Partial<BangumiEpisode> & { id: number }): BangumiEpisode {
	return {
		subject_id: 1,
		type: 0,
		sort: overrides.id,
		ep: overrides.id,
		name: '',
		name_cn: '',
		airdate: '',
		duration: '',
		...overrides,
	};
}

const official = collectOfficialEpisodes([
	{
		subjectId: 111,
		partIndex: 0,
		episodes: [
			episode({ id: 1, sort: 0, ep: 1, name_cn: '第0话' }),
			episode({ id: 2, sort: 1, ep: 2, name_cn: '第1话' }),
			episode({ id: 3, sort: 2, ep: 3, name_cn: '第2话' }),
			episode({ id: 4, type: 1, sort: 3, ep: 0, name_cn: 'SP' }),
			episode({ id: 5, type: 4, sort: 0, ep: 0, name: 'PV' }),
		],
	},
]);

function localSeason(files: string[]): LocalSeasonInput {
	return {
		seasonId: 'season-1',
		path: '第2季',
		title: '第二季',
		episodes: files.map((fileName, index) => ({ id: `ep-${index + 1}`, fileName })),
	};
}

describe('描述与日期解析', () => {
	it('去掉 Bangumi 的 url 标记与分隔线', () => {
		const summary = '[url=https://bgm.tv]来源[/url]\n\n正文第一段\n---\n正文第二段';
		expect(stripSummary(summary)).toBe('来源\n正文第一段\n正文第二段');
	});

	it('空描述返回空串', () => {
		expect(stripSummary(undefined)).toBe('');
		expect(stripSummary('   ')).toBe('');
	});

	it('日期解析为年月', () => {
		expect(parseDate('2021-01-10')).toEqual([2021, 1]);
		expect(parseDate('2024-12')).toEqual([2024, 12]);
	});

	it('无法解析或月份越界时返回 null', () => {
		expect(parseDate(undefined)).toBeNull();
		expect(parseDate('未定档')).toBeNull();
		expect(parseDate('2024-13-01')).toBeNull();
	});
});

describe('状态推导', () => {
	const today = new Date('2026-11-27T00:00:00Z');

	it('全部已播出为已完结', () => {
		const result = deriveStatus(
			[episode({ id: 1, airdate: '2026-01-01' }), episode({ id: 2, airdate: '2026-03-01' })],
			today,
		);
		expect(result.status).toBe(3);
	});

	it('仍有未播出为连载中', () => {
		const result = deriveStatus(
			[episode({ id: 1, airdate: '2026-01-01' }), episode({ id: 2, airdate: '2027-01-01' })],
			today,
		);
		expect(result.status).toBe(2);
	});

	it('首播在未来为未放送', () => {
		const result = deriveStatus([episode({ id: 1, airdate: '2027-01-01' })], today);
		expect(result.status).toBe(4);
	});

	it('没有日期时返回未设置，不猜状态', () => {
		expect(deriveStatus([episode({ id: 1 })], today).status).toBe(0);
	});
});

describe('季摘要', () => {
	it('统计文件数与无编号文件数，样例取首两个与末一个', () => {
		const summary = summarizeSeason(localSeason(['02.mp4', '00-特别篇.mp4', '01.mp4', 'SP.mp4']), 's1');
		expect(summary.fileCount).toBe(4);
		expect(summary.specialCount).toBe(1);
		expect(summary.sampleFiles).toEqual(['00-特别篇.mp4', '01.mp4', 'SP.mp4']);
		expect(summary.relativePath).toBe('第2季');
	});
});

describe('单季预览', () => {
	it('规则命中时按文件名顺序编号，官方标题生效', () => {
		const preview = buildSeasonPreview(localSeason(['00-特别篇.mp4', '01.mp4', '02.mp4', 'SP.mp4']), official);
		expect(preview.alignment).toBe('rule');
		expect(preview.episodes.map((item) => [item.position, item.kind, item.title])).toEqual([
			[1, 'main', '第0话'],
			[2, 'main', '第1话'],
			[3, 'main', '第2话'],
			[4, 'special', 'SP'],
		]);
	});

	it('未匹配的文件排在末尾并保留文件名标题', () => {
		// 官方正片是 0..2、SP 序号是 3；09 既不在正片里也不对应任何 SP
		const preview = buildSeasonPreview(localSeason(['01.mp4', '02.mp4', '09.mp4']), official);
		expect(preview.alignment).toBe('partial');
		expect(preview.episodes.at(-1)).toMatchObject({ kind: 'unmatched', title: '09', position: 3 });
	});

	it('规则失败且有 AI 结果时采用 AI 映射，顺序仍取自文件名', () => {
		// EXTRA 没有编号也没有特别篇标记，规则无法归属，此时才轮到 AI
		const input = localSeason(['01.mp4', '02.mp4', 'EXTRA.mp4']);
		const aiMap = new Map([
			['01.mp4', official[1]!],
			['02.mp4', official[2]!],
			['EXTRA.mp4', official[3]!],
		]);
		const preview = buildSeasonPreview(input, official, aiMap);
		expect(preview.alignment).toBe('ai');
		expect(preview.episodes.map((item) => [item.position, item.title])).toEqual([
			[1, '第1话'],
			[2, '第2话'],
			[3, 'SP'],
		]);
	});

	it('规则失败且没有 AI 结果时标记为待人工确认', () => {
		const preview = buildSeasonPreview(localSeason(['01.mp4', 'EXTRA.mp4']), official);
		expect(preview.alignment).toBe('partial');
		expect(preview.notes.some((note) => note.includes('请手动确认'))).toBe(true);
	});
});

describe('季标题规范化', () => {
	it('单条目直接使用条目名', () => {
		expect(normalizeSeasonTitle(['无职转生 第二季'])).toBe('无职转生 第二季');
	});

	it('多条目只保留差异部分', () => {
		expect(
			normalizeSeasonTitle(['无职转生～到了异世界就拿出真本事～', '无职转生～到了异世界就拿出真本事～ 第2部分']),
		).toBe('无职转生～到了异世界就拿出真本事～ 第2部分');
	});

	it('名称完全相同时不重复追加', () => {
		expect(normalizeSeasonTitle(['同名', '同名'])).toBe('同名');
	});

	it('空数组返回空串', () => {
		expect(normalizeSeasonTitle([])).toBe('');
	});
});

describe('候选与条目排序', () => {
	it('候选去重并按首播日期排序', () => {
		const candidates = normalizeCandidates([
			{ id: 2, name: 'B', name_cn: '乙', date: '2024-01-01' },
			{ id: 1, name: 'A', name_cn: '甲', date: '2021-01-01' },
			{ id: 2, name: 'B', name_cn: '乙', date: '2024-01-01' },
		]);
		expect(candidates.map((item) => item.id)).toEqual([1, 2]);
	});

	it('条目按首播日期决定 partIndex', () => {
		const details = new Map([
			[10, { id: 10, name: '', name_cn: '', date: '2021-10-01' }],
			[20, { id: 20, name: '', name_cn: '', date: '2021-01-01' }],
		]);
		expect(orderSubjects([10, 20], details)).toEqual([20, 10]);
	});
});

describe('排序数组校验', () => {
	const allowed = ['a', 'b', 'c'];

	it('完整排列通过', () => {
		expect(validateOrder(['c', 'a', 'b'], allowed)).toEqual({ ok: true });
	});

	it('长度不符', () => {
		expect(validateOrder(['a', 'b'], allowed)).toMatchObject({ ok: false });
	});

	it('存在重复', () => {
		expect(validateOrder(['a', 'a', 'b'], allowed)).toMatchObject({
			ok: false,
			message: expect.stringContaining('重复'),
		});
	});

	it('存在不属于该季的 id', () => {
		expect(validateOrder(['a', 'b', 'x'], allowed)).toMatchObject({
			ok: false,
			message: expect.stringContaining('不属于'),
		});
	});
});
