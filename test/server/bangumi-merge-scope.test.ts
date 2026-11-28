import { describe, expect, it, vi } from 'vitest';
import type { Series } from '~server/data/series';
import { applyChangeSet, readLocalSeasons } from '~server/src/integrations/bangumi/sync';

/**
 * 合并组的同步范围。
 *
 * 详情页把主系列与成员的季拼在一起展示，同步必须覆盖同一范围：
 * 只处理主系列会让成员的季永远拿不到标题与排序。
 *
 * 这里用鸭子类型的假对象，不碰真实媒体目录。
 */

function fakeEpisode(id: string) {
	return {
		id,
		title: '',
		getEpisodeName: () => `${id}.mp4`,
		updateTitle: vi.fn(async () => {}),
		updateKind: vi.fn(async () => {}),
	};
}

function fakeSeason(id: string, name: string, episodeIds: string[]) {
	return {
		id,
		title: '',
		episodes: episodeIds.map((episodeId) => fakeEpisode(episodeId)),
		getSeasonName: () => name,
		updateTitle: vi.fn(async () => {}),
		rewriteEpisodeOrder: vi.fn(async () => {}),
	};
}

function fakeSeries(title: string, seasons: ReturnType<typeof fakeSeason>[]) {
	return {
		// 真实 Series 的字段 getter 都是 Promise，假对象保持同样形状才能抓到漏 await
		title: Promise.resolve(title),
		seasons,
		updateTitle: vi.fn(async () => {}),
		updateDescription: vi.fn(async () => {}),
		updateDate: vi.fn(async () => {}),
		updateStatus: vi.fn(async () => {}),
		updateTypes: vi.fn(async () => {}),
		waitDataSave: vi.fn(async () => {}),
	};
}

type FakeSeries = ReturnType<typeof fakeSeries>;

function asGroup(list: FakeSeries[]) {
	return list as unknown as Series[];
}

describe('readLocalSeasons', () => {
	it('把主系列与成员的季按顺序拼在一起', async () => {
		const main = fakeSeries('微速前进', [fakeSeason('main-1', '正片', ['m1'])]);
		const member = fakeSeries('微速前行！', [fakeSeason('member-1', '正片', ['x1', 'x2'])]);

		const result = await readLocalSeasons(asGroup([main, member]));

		expect(result.map((season) => season.seasonId)).toEqual(['main-1', 'member-1']);
		expect(result.map((season) => season.path)).toEqual(['正片', '微速前行！ / 正片']);
		expect(result[1]!.episodes).toEqual([
			{ id: 'x1', fileName: 'x1.mp4' },
			{ id: 'x2', fileName: 'x2.mp4' },
		]);
	});

	it('主系列自己的季不加来源前缀', async () => {
		const main = fakeSeries('主系列', [fakeSeason('main-1', '第 1 季', ['m1'])]);
		const [season] = await readLocalSeasons(asGroup([main]));
		expect(season!.path).toBe('第 1 季');
	});
});

describe('applyChangeSet 的合并范围', () => {
	it('季来自成员系列时也能写入，系列字段仍写主系列', async () => {
		const mainSeason = fakeSeason('main-1', '正片', ['m1']);
		const memberSeason = fakeSeason('member-1', '正片', ['x1']);
		const main = fakeSeries('主系列', [mainSeason]);
		const member = fakeSeries('成员系列', [memberSeason]);

		const result = await applyChangeSet(asGroup([main, member]), {
			series: { title: '新标题' },
			seasons: [
				{
					seasonId: 'member-1',
					title: '第 2 季',
					episodes: [{ episodeId: 'x1', title: '第一话' }],
				},
			],
		});

		expect(main.updateTitle).toHaveBeenCalledWith('新标题');
		expect(member.updateTitle).not.toHaveBeenCalled();
		expect(memberSeason.updateTitle).toHaveBeenCalledWith('第 2 季');
		expect(memberSeason.episodes[0]!.updateTitle).toHaveBeenCalledWith('第一话');
		expect(result.seasons).toEqual([{ seasonId: 'member-1', title: true, order: 0, episodes: 1 }]);
		// 成员的季被写过，保存不能只等主系列
		expect(member.waitDataSave).toHaveBeenCalled();
	});

	it('不属于这个合并组的季仍然拒绝', async () => {
		const main = fakeSeries('主系列', [fakeSeason('main-1', '正片', ['m1'])]);
		// 文案放在 body 上（ApiError 的第二个参数），由响应中间件转成前端提示
		await expect(applyChangeSet(asGroup([main]), { seasons: [{ seasonId: 'ghost' }] })).rejects.toMatchObject({
			body: expect.stringContaining('不属于该系列'),
		});
	});

	it('集类型与标题一起写入，缺省时不改类型', async () => {
		const withKind = fakeSeason('main-1', '正片', ['m1']);
		const withoutKind = fakeSeason('main-2', '正片', ['m2']);
		const main = fakeSeries('主系列', [withKind, withoutKind]);

		await applyChangeSet(asGroup([main]), {
			seasons: [
				{ seasonId: 'main-1', episodes: [{ episodeId: 'm1', title: '第一话', kind: 'special' }] },
				{ seasonId: 'main-2', episodes: [{ episodeId: 'm2', title: '第二话' }] },
			],
		});

		expect(withKind.episodes[0]!.updateTitle).toHaveBeenCalledWith('第一话');
		expect(withKind.episodes[0]!.updateKind).toHaveBeenCalledWith('special');
		// 未传 kind 表示保持当前类型，不能被默认值覆盖
		expect(withoutKind.episodes[0]!.updateKind).not.toHaveBeenCalled();
	});
});
