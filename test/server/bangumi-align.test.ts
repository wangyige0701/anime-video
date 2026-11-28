import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { alignByRules, collectOfficialEpisodes, orderLocalFiles } from '~server/src/integrations/bangumi/align';
import { hasSpecialMarker, parseEpisodeNumber } from '~server/src/integrations/bangumi/filenames';
import type { BangumiEpisode } from '~server/src/integrations/bangumi/types';

/**
 * 官方剧集按真实响应的结构在用例内构造，仓库不保存任何抓取数据。
 *
 * 构造时刻意保留三个反直觉细节，它们是规则正确性的关键：
 * 1. `type=4` 的 PV / 放送直前特番也带 `sort=0`；
 * 2. 第 0 话是 `type=0`、`sort=0`、`ep=1`；
 * 3. 附加特别篇的 `sort` 可以是小数（18.5），`ep` 恒为 0。
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

/** 第一季：条目 A 是 1..11，条目 B 是 12..23，另有 SP=24 与一条 type=4 的放送直前特番 */
function seasonOneParts() {
	const firstQuarter = Array.from({ length: 11 }, (_, index) =>
		episode({
			id: 100 + index,
			subject_id: 111,
			sort: index + 1,
			ep: index + 1,
			name_cn: `第一季第${index + 1}话`,
		}),
	);
	firstQuarter.push(episode({ id: 199, subject_id: 111, type: 4, sort: 0, ep: 0, name: 'PV1' }));
	const secondQuarter = Array.from({ length: 12 }, (_, index) =>
		episode({
			id: 200 + index,
			subject_id: 222,
			sort: index + 12,
			ep: index + 1,
			name_cn: `第一季第${index + 12}话`,
		}),
	);
	secondQuarter.push(
		episode({ id: 299, subject_id: 222, type: 1, sort: 24, ep: 0, name_cn: '艾莉丝的哥布林讨伐' }),
		episode({ id: 298, subject_id: 222, type: 4, sort: 0, ep: 0, name: '第2クール放送直前スペシャル' }),
	);
	return [
		{ subjectId: 111, partIndex: 0, episodes: firstQuarter },
		{ subjectId: 222, partIndex: 1, episodes: secondQuarter },
	];
}

/** 第二季：条目 C 是 0..12（第 0 话 ep=1），条目 D 是 13..24，SP 的 sort 是 18.5 */
function seasonTwoParts() {
	const firstPart = Array.from({ length: 13 }, (_, index) =>
		episode({
			id: 300 + index,
			subject_id: 333,
			sort: index,
			// 第 0 话的 ep 是 1，与 sort 相差 1，用 ep 判断会整体错位
			ep: index + 1,
			name_cn: index === 0 ? '守护术师菲兹' : `第二季第${index}话`,
		}),
	);
	const secondPart = Array.from({ length: 12 }, (_, index) =>
		episode({
			id: 400 + index,
			subject_id: 444,
			sort: index + 13,
			ep: index + 1,
			name_cn: `第二季第${index + 13}话`,
		}),
	);
	secondPart.push(
		episode({ id: 499, subject_id: 444, type: 1, sort: 18.5, ep: 0, name_cn: '転移迷宮編 直前スペシャル' }),
	);
	return [
		{ subjectId: 333, partIndex: 0, episodes: firstPart },
		{ subjectId: 444, partIndex: 1, episodes: secondPart },
	];
}

const seasonOne = () => collectOfficialEpisodes(seasonOneParts());
const seasonTwo = () => collectOfficialEpisodes(seasonTwoParts());

const pad = (value: number) => String(value).padStart(2, '0');

describe('文件名集号解析', () => {
	it('第 0 话与前缀编号', () => {
		expect(parseEpisodeNumber('00-特别篇.mp4')).toBe(0);
		expect(parseEpisodeNumber('01.mp4')).toBe(1);
		expect(parseEpisodeNumber('24.mp4')).toBe(24);
		expect(parseEpisodeNumber('3 - 标题.mkv')).toBe(3);
	});

	it('方括号编号与「第 N 话」', () => {
		expect(
			parseEpisodeNumber('[Studio GreenTea] Mushoku Tensei S3 [09][WebRip][HEVC-10bit 1080p AAC][JPSC].mp4'),
		).toBe(9);
		expect(parseEpisodeNumber('无职转生 第10话.mp4')).toBe(10);
		expect(parseEpisodeNumber('无职转生 S02E05.mp4')).toBe(5);
	});

	it('分辨率、编码、年份不是集号', () => {
		expect(parseEpisodeNumber('1080p.mp4')).toBeUndefined();
		expect(parseEpisodeNumber('2024.mp4')).toBeUndefined();
		expect(parseEpisodeNumber('x265.mp4')).toBeUndefined();
		expect(parseEpisodeNumber('特别篇.mp4')).toBeUndefined();
	});

	it('四位数集号（长篇连载）', () => {
		expect(parseEpisodeNumber('[Lilith-Raws] One Piece - 1085 [Baha][WEB-DL][1080p][AVC AAC].mp4')).toBe(1085);
		expect(parseEpisodeNumber('[Group] Anime Title [1085][1080p].mkv')).toBe(1085);
		// 分辨率不能被当成四位数集号
		expect(parseEpisodeNumber('[Group] Anime Title [1080p][CHS].mkv')).toBeUndefined();
	});

	it('特别篇标记识别', () => {
		expect(hasSpecialMarker('SP1.mp4')).toBe(true);
		expect(hasSpecialMarker('00-特别篇.mp4')).toBe(true);
		expect(hasSpecialMarker('[Group] Anime Title - OVA [1080p].mp4')).toBe(true);
		expect(hasSpecialMarker('01.mp4')).toBe(false);
	});
});

describe('本地文件排序', () => {
	it('按集号升序，第 0 话在最前', () => {
		expect(orderLocalFiles(['02.mp4', '00-特别篇.mp4', '01.mp4'])).toEqual(['00-特别篇.mp4', '01.mp4', '02.mp4']);
	});

	it('混排目录按解析出的集号排序，不受字符串比较影响', () => {
		const files = [
			'[Studio GreenTea] Mushoku Tensei S3 [14][WebRip][HEVC-10bit 1080p AAC][JPSC].mp4',
			'01.mp4',
			'[Studio GreenTea] Mushoku Tensei S3 [09][WebRip][HEVC-10bit 1080p AAC][JPSC].mp4',
			'08.mp4',
		];
		const ordered = orderLocalFiles(files);
		expect(ordered[0]).toBe('01.mp4');
		expect(ordered[1]).toBe('08.mp4');
		expect(ordered[2]).toContain('[09]');
		expect(ordered[3]).toContain('[14]');
	});

	it('无集号的文件排在最后', () => {
		expect(orderLocalFiles(['特别篇.mp4', '02.mp4', '01.mp4'])).toEqual(['01.mp4', '02.mp4', '特别篇.mp4']);
	});
});

describe('官方剧集归一化', () => {
	it('两个条目拼成 1..23，PV 被丢弃，SP 单独标记', () => {
		const official = seasonOne();
		expect(official.filter((item) => item.kind === 'main').map((item) => item.sort)).toEqual(
			Array.from({ length: 23 }, (_, index) => index + 1),
		);
		const special = official.filter((item) => item.kind === 'special');
		expect(special).toHaveLength(1);
		expect(special[0]!.sort).toBe(24);
		expect(special[0]!.title).toBe('艾莉丝的哥布林讨伐');
		// type=4 的放送直前特番同样带 sort=0，必须被排除
		expect(official.some((item) => item.title.includes('放送直前'))).toBe(false);
	});

	it('sort 从 0 开始，第 0 话属于本篇', () => {
		const main = seasonTwo().filter((item) => item.kind === 'main');
		expect(main).toHaveLength(25);
		expect(main[0]!.sort).toBe(0);
		expect(main[0]!.kind).toBe('main');
		expect(main[0]!.title).toBe('守护术师菲兹');
	});

	it('小数 sort 只影响匹配，不影响正片顺序', () => {
		const special = seasonTwo().filter((item) => item.kind === 'special');
		expect(special).toHaveLength(1);
		expect(special[0]!.sort).toBe(18.5);
	});
});

describe('规则对齐（只在可确证时下结论）', () => {
	it('正片集号齐全时直接确证，第 0 话也算正片', () => {
		const files = Array.from({ length: 25 }, (_, index) => `${pad(index)}.mp4`);
		const result = alignByRules(files, seasonTwo());
		expect(result.resolved).toBe(true);
		expect(result.assignments.get('00.mp4')!.sort).toBe(0);
		expect(result.assignments.get('00.mp4')!.kind).toBe('main');
		expect(result.assignments.get('00.mp4')!.title).toBe('守护术师菲兹');
		expect(result.missing).toHaveLength(0);
	});

	it('发布组原名按解析出的集号确证，缺集不影响映射', () => {
		const files = [
			'[Lilith-Raws] Tensei shitara Slime Datta Ken - 01 [Baha][WEB-DL][1080p][AVC AAC][CHT][MP4].mp4',
			'[Lilith-Raws] Tensei shitara Slime Datta Ken - 02 [Baha][WEB-DL][1080p][AVC AAC][CHT][MP4].mp4',
		];
		const result = alignByRules(files, seasonOne());
		expect(result.resolved).toBe(true);
		expect(result.assignments.get(files[0]!)!.sort).toBe(1);
		expect(result.missing).toHaveLength(21);
	});

	it('本地缺集时保留后续文件的真实集号，不按位置顺延', () => {
		const result = alignByRules(['01.mp4', '02.mp4', '04.mp4'], seasonOne());
		expect(result.resolved).toBe(true);
		expect(result.assignments.get('04.mp4')!.sort).toBe(4);
		const missingSorts = result.missing.map((item) => item.sort);
		expect(missingSorts).toContain(3);
		expect(missingSorts).not.toContain(4);
		expect(missingSorts).toHaveLength(20);
	});

	it('文件名带特别篇标记时不下结论，即使集号能对上官方特别篇', () => {
		const files = [...Array.from({ length: 23 }, (_, index) => `${pad(index + 1)}.mp4`), 'SP-哥布林讨伐.mp4'];
		const result = alignByRules(files, seasonOne());
		expect(result.resolved).toBe(false);
		expect(result.reason).toContain('特别篇标记');
		expect(result.reason).toContain('SP-哥布林讨伐.mp4');
	});

	it('00-特别篇 不再直接断言为第 0 话', () => {
		const files = ['00-特别篇.mp4', ...Array.from({ length: 24 }, (_, index) => `${pad(index + 1)}.mp4`)];
		const result = alignByRules(files, seasonTwo());
		expect(result.resolved).toBe(false);
		expect(result.reason).toContain('00-特别篇.mp4');
	});

	it('集号在官方正片里不存在时不下结论（可能是特别篇或合并集）', () => {
		const result = alignByRules(['01.mp4', '24.mp4'], seasonOne());
		expect(result.resolved).toBe(false);
		expect(result.reason).toContain('24.mp4(24)');
	});

	it('有文件解析不出集号时整季交给模型', () => {
		const result = alignByRules(
			['01.mp4', '[Moozzi2] Kimi no Na wa [Movie][BDRip 1920x1080 x265].mkv'],
			seasonOne(),
		);
		expect(result.resolved).toBe(false);
		expect(result.reason).toContain('无法从文件名解析集号');
	});

	it('集号重复时不下结论', () => {
		const result = alignByRules(['01.mp4', '01 - 副本.mp4'], seasonOne());
		expect(result.resolved).toBe(false);
		expect(result.reason).toContain('重复');
	});

	it('官方特别篇不参与规则匹配，只提示数量', () => {
		const files = Array.from({ length: 23 }, (_, index) => `${pad(index + 1)}.mp4`);
		const result = alignByRules(files, seasonOne());
		expect(result.resolved).toBe(true);
		expect(result.assignments.size).toBe(23);
		expect(result.assignments.has('24.mp4')).toBe(false);
		expect(result.notes.some((note) => note.includes('1 个特别篇'))).toBe(true);
	});
});

/**
 * 真实响应的本地回归。
 *
 * 抓取数据不入库（`.cache/` 已被忽略），文件存在时用真实字段组合再校验一遍，
 * 不存在时整组跳过，不阻塞干净检出后的测试。生成方式：`node .cache/bangumi-dump.mjs`。
 */
const rawDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache/bangumi-raw');
const hasRaw = ['277554', '325585', '373247', '444557'].every((id) =>
	fs.existsSync(path.join(rawDir, `episodes.${id}.json`)),
);

describe.skipIf(!hasRaw)('真实响应回归（本地 .cache）', () => {
	const read = (id: string) =>
		(JSON.parse(fs.readFileSync(path.join(rawDir, `episodes.${id}.json`), 'utf8')) as { data: BangumiEpisode[] })
			.data;

	it('第一季 23 集正片 + 1 个 SP，第二季 25 集从 0 开始', () => {
		const one = collectOfficialEpisodes([
			{ subjectId: 277554, partIndex: 0, episodes: read('277554') },
			{ subjectId: 325585, partIndex: 1, episodes: read('325585') },
		]);
		expect(one.filter((item) => item.kind === 'main')).toHaveLength(23);
		expect(one.filter((item) => item.kind === 'special').map((item) => item.sort)).toEqual([24]);

		const two = collectOfficialEpisodes([
			{ subjectId: 373247, partIndex: 0, episodes: read('373247') },
			{ subjectId: 444557, partIndex: 1, episodes: read('444557') },
		]);
		const main = two.filter((item) => item.kind === 'main');
		expect(main).toHaveLength(25);
		expect(main[0]!.sort).toBe(0);
		expect(main[0]!.title).toBe('守护术师菲兹');
		expect(two.filter((item) => item.kind === 'special').map((item) => item.sort)).toEqual([18.5]);
	});
});
