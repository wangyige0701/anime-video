import { describe, expect, it } from 'vitest';
import { collectOfficialEpisodes } from '~server/src/integrations/bangumi/align';
import type { OfficialEpisode } from '~server/src/integrations/bangumi/align';
import { buildSeasonPreview } from '~server/src/integrations/bangumi/sync';
import type { LocalSeasonInput } from '~server/src/integrations/bangumi/sync';
import type { BangumiEpisode } from '~server/src/integrations/bangumi/types';

/**
 * 合并集预览：一个文件装了几集（`01-03.mp4`）。
 *
 * 是否合并、合并成什么标题都来自模型的 `merged` / `titles`，这里只验证预览如何消费：
 * 标题用模型给的、覆盖集数进 `coveredCount`，模型没给标题时才退回首集标题。
 * 本地仍是「一个文件 = 一条集记录」，落库位置不受影响。
 */
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
		subjectId: 1,
		partIndex: 0,
		episodes: [
			...Array.from({ length: 6 }, (_, index) =>
				episode({ id: index + 1, sort: index + 1, ep: index + 1, name_cn: `第${index + 1}话` }),
			),
			episode({ id: 99, type: 1, sort: 7, ep: 0, name_cn: '特别篇' }),
		],
	},
]);

function season(fileNames: string[]): LocalSeasonInput {
	return {
		seasonId: 's1',
		path: '某番/第1季',
		title: '',
		episodes: fileNames.map((fileName, index) => ({ id: `e${index + 1}`, fileName })),
	};
}

/** 按官方序列取前 n 集，模拟模型返回的数组 */
function covered(count: number, offset = 0): OfficialEpisode[] {
	return official.filter((item) => item.kind === 'main').slice(offset, offset + count);
}

describe('合并集的预览', () => {
	const files = ['01-03.mp4', '04-06.mp4'];
	const base = season(files);
	const first = covered(3);
	const second = covered(3, 3);

	const aiAlign = new Map([
		['01-03.mp4', first[0]!],
		['04-06.mp4', second[0]!],
	]);
	const aiMerged = new Map([
		['01-03.mp4', first],
		['04-06.mp4', second],
	]);
	const aiTitles = new Map([
		['01-03.mp4', '第1话／第2话／第3话'],
		['04-06.mp4', '第4话／第5话／第6话'],
	]);

	it('标题用模型给的合并结果，覆盖集数进预览', () => {
		const preview = buildSeasonPreview(base, official, aiAlign, aiMerged, aiTitles);
		const [one, two] = preview.episodes;

		expect(preview.alignment).toBe('ai');
		expect(one!.title).toBe('第1话／第2话／第3话');
		expect(one!.coveredCount).toBe(3);
		expect(one!.coveredTitles).toEqual(['第1话', '第2话', '第3话']);
		expect(two!.title).toBe('第4话／第5话／第6话');
		// 落库位置仍按文件顺序，不因合并而跳号
		expect(preview.episodes.map((item) => item.position)).toEqual([1, 2]);
	});

	it('模型判定合并但没给标题时用首集标题，覆盖集数照常', () => {
		const preview = buildSeasonPreview(base, official, aiAlign, aiMerged);
		expect(preview.episodes[0]!.title).toBe('第1话');
		expect(preview.episodes[0]!.coveredCount).toBe(3);
	});

	it('模型整季都判无对应时退回规则结果', () => {
		const preview = buildSeasonPreview(
			base,
			official,
			new Map([
				['01-03.mp4', null],
				['04-06.mp4', null],
			]),
			aiMerged,
			aiTitles,
		);
		expect(preview.alignment).toBe('rule');
		expect(preview.episodes[0]!.title).toBe('第1话');
		expect(preview.episodes[0]!.coveredCount).toBe(0);
	});

	it('没有合并结果时普通文件不受影响', () => {
		const single = buildSeasonPreview(season(['01.mp4']), official);
		expect(single.alignment).toBe('rule');
		expect(single.episodes[0]!).toMatchObject({ title: '第1话', coveredCount: 0, coveredTitles: [] });
	});
});
