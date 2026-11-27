/**
 * 本地文件与官方剧集的对齐规则。
 *
 * 三条不变量：
 * 1. **顺序由本地文件名决定**，官方数据只提供标题与「哪一集对应哪条官方记录」。
 * 2. 分类只看 `type`：0 是本篇（含第 0 话），1 是附加特别篇，其余丢弃。
 * 3. `ep` 永远不用：它跨条目重复，且 SP 的 `ep` 恒为 0。
 *
 * 规则能给出唯一归属时不调用模型；只有集号重复、文件名无编号且剩余候选不唯一、
 * 或本地集号在官方找不到时才需要模型介入——而这些情况模型也只能猜，最终仍需人工确认。
 */
import type { BangumiEpisode } from './types';
import { hasSpecialMarker, naturalCompare, parseEpisodeNumber } from './filenames';

/** Bangumi 剧集类型；只用到本篇与特别篇，其余（OP/ED/PV/MAD）一律丢弃 */
const EPISODE_TYPE = {
	MAIN: 0,
	SPECIAL: 1,
} as const;

export type EpisodeKind = 'main' | 'special';

/** 归一化后的官方剧集；`episodeId` 是 Bangumi 全局唯一的剧集 id */
export interface OfficialEpisode {
	episodeId: number;
	subjectId: number;
	/** 季内第几个条目，从 0 开始（split cour 会把一个季拆成两个条目） */
	partIndex: number;
	kind: EpisodeKind;
	/** 官方播出序号，跨条目连续；可为 0 或小数，仅用于匹配，不落库 */
	sort: number;
	name: string;
	nameCn: string;
	/** 展示标题，`name_cn || name` */
	title: string;
	airdate: string;
}

export interface OfficialPart {
	subjectId: number;
	/** 条目在季内的顺序，调用方按首播日期排好后传入 */
	partIndex: number;
	episodes: BangumiEpisode[];
}

export interface RuleAlignment {
	resolved: boolean;
	/** 无法用规则解决时的原因，供日志与人工提示 */
	reason: string;
	/** 文件名 → 官方剧集；未归属的文件不出现在此表 */
	assignments: Map<string, OfficialEpisode>;
	/** 官方有、本地没有的集，仅用于提示，不影响对齐结果 */
	missing: OfficialEpisode[];
	notes: string[];
}

function titleOf(episode: BangumiEpisode) {
	return (episode.name_cn || episode.name || '').trim();
}

/**
 * 把多个条目的剧集拼成一个季。
 *
 * 只保留 type 0/1，并按 (partIndex, sort) 排序 —— 这样 `sort=0` 的第 0 话会落在
 * 所属条目最前，split cour 的两个条目也按播出顺序拼接。type=4 的 PV/CM
 * （同样可能是 sort=0）必须排除，否则会与第 0 话抢同一个位置。
 */
export function collectOfficialEpisodes(parts: OfficialPart[]): OfficialEpisode[] {
	const result: OfficialEpisode[] = [];
	for (const part of [...parts].sort((a, b) => a.partIndex - b.partIndex)) {
		const rows = part.episodes
			.filter((episode) => episode.type === EPISODE_TYPE.MAIN || episode.type === EPISODE_TYPE.SPECIAL)
			.slice()
			.sort((a, b) => a.sort - b.sort || a.id - b.id);
		for (const episode of rows) {
			result.push({
				episodeId: episode.id,
				subjectId: part.subjectId,
				partIndex: part.partIndex,
				kind: episode.type === EPISODE_TYPE.SPECIAL ? 'special' : 'main',
				sort: episode.sort,
				name: episode.name ?? '',
				nameCn: episode.name_cn ?? '',
				title: titleOf(episode),
				airdate: episode.airdate ?? '',
			});
		}
	}
	return result;
}

/**
 * 本地文件的最终顺序：有集号的按集号升序（0 在最前），无集号的按文件名自然序追加。
 *
 * 无集号的文件不插入正片中间：它的位置无法从名字确定，交给人工判断，
 * 默认排在末尾比猜一个位置更安全。
 */
export function orderLocalFiles(files: string[]): string[] {
	const parsed = files.map((fileName) => ({ fileName, number: parseEpisodeNumber(fileName) }));
	const numbered = parsed
		.filter((item): item is { fileName: string; number: number } => item.number !== undefined)
		.sort((a, b) => a.number - b.number || naturalCompare(a.fileName, b.fileName));
	const rest = parsed
		.filter((item) => item.number === undefined)
		.sort((a, b) => naturalCompare(a.fileName, b.fileName));
	return [...numbered, ...rest].map((item) => item.fileName);
}

/**
 * 用集号做唯一映射。
 *
 * 与「按位置顺延」的区别：本地缺集时后续文件仍保留各自真实集号，不会整体错位。
 * 缺集属于正常状态（用户没下载），只记录到 `missing`，不阻断对齐。
 */
export function alignByRules(files: string[], official: OfficialEpisode[]): RuleAlignment {
	const notes: string[] = [];
	const missing: OfficialEpisode[] = [];
	const assignments = new Map<string, OfficialEpisode>();

	const mainBySort = new Map<number, OfficialEpisode>();
	for (const episode of official) {
		if (episode.kind === 'main') {
			mainBySort.set(episode.sort, episode);
		}
	}

	const numbers = files.map((fileName) => parseEpisodeNumber(fileName)).filter((n): n is number => n !== undefined);
	const duplicated = [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))];
	if (duplicated.length) {
		return { resolved: false, reason: `本地集号重复：${duplicated.join('、')}`, assignments, missing, notes };
	}

	const leftover: string[] = [];
	for (const fileName of files) {
		const number = parseEpisodeNumber(fileName);
		const episode = number === undefined ? undefined : mainBySort.get(number);
		if (episode) {
			assignments.set(fileName, episode);
			continue;
		}
		leftover.push(fileName);
	}

	// 剩余文件归属附加特别篇：先按官方序号精确匹配，再退到「唯一剩余 + 文件名带标记」
	const remainingSpecial = official.filter((episode) => episode.kind === 'special');
	for (const fileName of leftover) {
		const number = parseEpisodeNumber(fileName);
		const matched = number === undefined ? undefined : remainingSpecial.find((episode) => episode.sort === number);
		if (matched) {
			assignments.set(fileName, matched);
			remainingSpecial.splice(remainingSpecial.indexOf(matched), 1);
			continue;
		}
		if (hasSpecialMarker(fileName) && remainingSpecial.length === 1) {
			assignments.set(fileName, remainingSpecial[0]!);
			remainingSpecial.splice(0, 1);
			continue;
		}
		return {
			resolved: false,
			reason: `${fileName} 集号在官方剧集中不存在，无法用规则归属`,
			assignments,
			missing,
			notes,
		};
	}

	const usedMain = new Set(
		[...assignments.values()].filter((episode) => episode.kind === 'main').map((episode) => episode.episodeId),
	);
	for (const episode of official) {
		if (episode.kind === 'main' && !usedMain.has(episode.episodeId)) {
			missing.push(episode);
		}
	}
	if (missing.length) {
		notes.push(
			`官方 ${missing.length} 集在本地没有文件：${missing.map((item) => `${item.sort}「${item.title}」`).join('、')}`,
		);
	}
	for (const episode of remainingSpecial) {
		notes.push(`官方特别篇「${episode.title}」本地没有文件`);
	}

	return { resolved: true, reason: '', assignments, missing, notes };
}
