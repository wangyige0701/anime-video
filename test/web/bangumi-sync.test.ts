import { describe, expect, it } from 'vitest';
import type { BangumiMatchSeason, BangumiPreviewResult, BangumiPreviewSeason } from '../../web/src/@types/bangumi-sync';
import type { BangumiCurrentSnapshot } from '../../web/src/utils/bangumiSync';
import {
	buildApplyInput,
	buildSeasonMapping,
	createSelection,
	describeAlignment,
	diffPreview,
	orderSeasonsBySuggestion,
	summarizeSelection,
} from '../../web/src/utils/bangumiSync';

function season(seasonId: string, order?: number, subjectIds: number[] = []): BangumiMatchSeason {
	return {
		seasonId,
		path: `无职转生/${seasonId}`,
		fileCount: 12,
		specialCount: 0,
		sampleFiles: ['01.mp4'],
		order,
		subjectIds,
	};
}

function previewSeason(seasonId: string, episodes: Array<[string, string]>, extra?: Partial<BangumiPreviewSeason>) {
	return {
		seasonId,
		path: `无职转生/${seasonId}`,
		fromTitle: '旧标题',
		title: '新标题',
		alignment: 'rule' as const,
		episodes: episodes.map(([episodeId, title], index) => ({
			episodeId,
			fileName: `${index + 1}.mp4`,
			position: index + 1,
			officialSort: index + 1,
			kind: 'main' as const,
			title,
			officialTitle: title,
		})),
		missing: [],
		notes: [],
		warnings: [],
		...extra,
	};
}

function preview(
	seasons: BangumiPreviewSeason[],
	series?: Partial<BangumiPreviewResult['series']>,
): BangumiPreviewResult {
	return {
		seriesId: 'series-1',
		series: {
			title: '无职转生',
			description: '简介',
			date: [2021, 1],
			status: 3,
			types: [1, 5],
			typesMatched: ['TV'],
			typesUnmatched: [],
			...series,
		},
		seasons,
		warnings: [],
	};
}

describe('orderSeasonsBySuggestion', () => {
	it('按 AI 建议的季顺序排列', () => {
		const result = orderSeasonsBySuggestion([season('a', 3), season('b', 1), season('c', 2)]);
		expect(result.map((item) => item.seasonId)).toEqual(['b', 'c', 'a']);
	});

	it('缺少建议顺序时保留本地顺序，并与已给出的顺序混合排序', () => {
		const result = orderSeasonsBySuggestion([season('a'), season('b', 1), season('c')]);
		// a 没有顺序时按原下标 1 参与比较，b 的 order 也是 1，稳定排序让 a 在前
		expect(result.map((item) => item.seasonId)).toEqual(['a', 'b', 'c']);
	});

	it('全部缺少顺序时完全保持本地顺序', () => {
		const result = orderSeasonsBySuggestion([season('c'), season('a'), season('b')]);
		expect(result.map((item) => item.seasonId)).toEqual(['c', 'a', 'b']);
	});
});

describe('buildSeasonMapping', () => {
	it('去重条目 id 并保留季的排列顺序', () => {
		const mapping = buildSeasonMapping([season('a', 2, [100, 100]), season('b', 1, [200])]);
		expect(mapping).toEqual([
			{ seasonId: 'b', subjectIds: [200] },
			{ seasonId: 'a', subjectIds: [100] },
		]);
	});

	it('没有条目的季传空数组，交由服务端排除', () => {
		expect(buildSeasonMapping([season('a')])).toEqual([{ seasonId: 'a', subjectIds: [] }]);
	});
});

describe('createSelection', () => {
	it('缺失的系列字段默认不勾选', () => {
		const selection = createSelection(
			preview([], { title: '  ', description: '', date: null, status: 0, types: [] }),
		);
		expect(selection.series).toEqual({
			title: false,
			description: false,
			date: false,
			status: false,
			types: false,
		});
	});

	it('空标题的集默认不勾选，多集的季默认勾选重排', () => {
		const selection = createSelection(
			preview([
				previewSeason('a', [
					['e1', '第一话'],
					['e2', '  '],
				]),
				previewSeason('b', [['e3', '剧场版']]),
			]),
		);
		expect(selection.seasons[0]!.title).toBe(true);
		expect(selection.seasons[0]!.episodes).toEqual({ e1: true, e2: false });
		expect(selection.seasons[0]!.order).toBe(true);
		expect(selection.seasons[1]!.order).toBe(false);
	});
});

describe('buildApplyInput', () => {
	it('只提交被勾选的系列字段', () => {
		const data = preview([]);
		const selection = createSelection(data);
		selection.series = { title: true, description: false, date: true, status: true, types: false };
		const input = buildApplyInput(data, selection);
		expect(input.series).toEqual({
			title: '无职转生',
			date: { year: 2021, month: 1 },
			status: 3,
		});
	});

	it('勾选空描述表示清空，仍然要提交空串', () => {
		const data = preview([], { description: '' });
		const selection = createSelection(data);
		selection.series = { title: false, description: true, date: false, status: false, types: false };
		expect(buildApplyInput(data, selection).series).toEqual({ description: '' });
	});

	it('排序始终是该季全部集的排列，不受逐集勾选影响', () => {
		const data = preview([
			previewSeason('a', [
				['e1', '第一话'],
				['e2', '第二话'],
				['e3', '第三话'],
			]),
		]);
		const selection = createSelection(data);
		selection.seasons[0]!.episodes = { e1: false, e2: true, e3: false };
		const input = buildApplyInput(data, selection);
		expect(input.seasons).toEqual([
			{
				seasonId: 'a',
				title: '新标题',
				order: ['e1', 'e2', 'e3'],
				episodes: [{ episodeId: 'e2', title: '第二话' }],
			},
		]);
	});

	it('取消重排后不下发 order', () => {
		const data = preview([
			previewSeason('a', [
				['e1', '第一话'],
				['e2', '第二话'],
			]),
		]);
		const selection = createSelection(data);
		selection.seasons[0]!.order = false;
		expect(buildApplyInput(data, selection).seasons?.[0]?.order).toBeUndefined();
	});

	it('整季都不勾选时该季不出现在提交内容里', () => {
		const data = preview([
			previewSeason('a', [
				['e1', '第一话'],
				['e2', '第二话'],
			]),
		]);
		const selection = createSelection(data);
		selection.series = { title: false, description: false, date: false, status: false, types: false };
		selection.seasons[0] = { seasonId: 'a', title: false, order: false, episodes: { e1: false, e2: false } };
		expect(buildApplyInput(data, selection)).toEqual({});
	});
});

describe('summarizeSelection', () => {
	it('按系列字段、季标题、重排与集标题分别统计', () => {
		const data = preview([
			previewSeason('a', [
				['e1', '第一话'],
				['e2', '第二话'],
			]),
			previewSeason('b', [['e3', '第三话']]),
		]);
		const summary = summarizeSelection(buildApplyInput(data, createSelection(data)));
		expect(summary).toEqual({
			series: 5,
			seasons: 2,
			titles: 7,
			orders: 1,
			episodes: 3,
			total: 11,
		});
	});

	it('空提交的 total 为 0', () => {
		expect(summarizeSelection({})).toEqual({ series: 0, seasons: 0, titles: 0, orders: 0, episodes: 0, total: 0 });
	});
});

describe('describeAlignment', () => {
	it('三种对齐方式都有明确文案', () => {
		expect(describeAlignment('rule')).toBe('按集号自动对齐');
		expect(describeAlignment('ai')).toBe('由模型对齐');
		expect(describeAlignment('partial')).toBe('部分对齐');
	});
});

describe('diffPreview', () => {
	function snapshot(overrides?: Partial<BangumiCurrentSnapshot>): BangumiCurrentSnapshot {
		return {
			series: {
				title: '无职转生',
				description: '简介',
				date: [2021, 1],
				status: 3,
				types: [1, 5],
			},
			seasons: [
				{
					seasonId: 'a',
					episodeIds: ['e1', 'e2'],
					episodeTitles: { e1: '第一话', e2: '第二话' },
				},
			],
			...overrides,
		};
	}

	it('逐项一致时全部标记为相同', () => {
		const data = preview(
			[
				previewSeason(
					'a',
					[
						['e1', '第一话'],
						['e2', '第二话'],
					],
					{ fromTitle: '新标题' },
				),
			],
			{ title: '无职转生', description: '简介', date: [2021, 1], status: 3, types: [1, 5] },
		);
		const diff = diffPreview(data, snapshot());
		expect(diff.series).toEqual({ title: true, description: true, date: true, status: true, types: true });
		expect(diff.seasons[0]).toEqual({ title: true, order: true, episodes: { e1: true, e2: true } });
	});

	it('只差首尾空白、或类型顺序不同，都算没有变化', () => {
		const data = preview([], {
			title: '  无职转生  ',
			description: '\n简介 ',
			types: [5, 1],
		});
		const diff = diffPreview(data, snapshot());
		expect(diff.series.title).toBe(true);
		expect(diff.series.description).toBe(true);
		expect(diff.series.types).toBe(true);
	});

	it('顺序不同或集数不同都判为重排有意义', () => {
		const data = preview([
			previewSeason('a', [
				['e2', '第二话'],
				['e1', '第一话'],
			]),
		]);
		expect(diffPreview(data, snapshot()).seasons[0]!.order).toBe(false);
		const extra = preview([
			previewSeason('a', [
				['e1', '第一话'],
				['e2', '第二话'],
				['e3', '第三话'],
			]),
		]);
		expect(diffPreview(extra, snapshot()).seasons[0]!.order).toBe(false);
	});

	it('预览缺失的字段不算相同，避免被当作「已一致」提交空值', () => {
		const base = snapshot();
		const data = preview([], { title: '  ', description: '', date: null, status: 0, types: [] });
		const diff = diffPreview(data, snapshot({ series: { ...base.series, status: 0, types: [] } }));
		expect(diff.series).toEqual({ title: false, description: false, date: false, status: false, types: false });
	});

	it('一致的项不会被默认勾选，应用数量随之减少', () => {
		const data = preview([
			previewSeason(
				'a',
				[
					['e1', '第一话'],
					['e2', '第二话'],
				],
				{ fromTitle: '新标题' },
			),
		]);
		const diff = diffPreview(data, snapshot());
		const summary = summarizeSelection(buildApplyInput(data, createSelection(data, diff)));
		expect(summary.total).toBe(0);
	});
});
