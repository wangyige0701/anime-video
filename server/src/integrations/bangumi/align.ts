/**
 * 本地文件与官方剧集的对齐规则。
 *
 * 三条不变量：
 * 1. **顺序由本地文件名决定**，官方数据只提供标题与「哪一集对应哪条官方记录」。
 * 2. 分类只看 `type`：0 是本篇（含第 0 话），1 是附加特别篇，其余丢弃。
 * 3. `ep` 永远不用：它跨条目重复，且 SP 的 `ep` 恒为 0。
 *
 * 规则只做**确证**，不做推断：只有文件名不带特别篇标记、集号可解析、且每个集号在
 * 官方正片里唯一存在时才给结论。文件名来自发布组时（`[组名] 作品名 - 05 [1080p][AVC]`），
 * 里面的数字属于发布组习惯，未必等于官方 sort，带「特别篇」字样的更是如此。
 * 任何一处对不上都交回给模型判定，宁可多一次请求，也不拿编号当事实。
 */
import { isUndefined } from '@wang-yige/utils';
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
		.filter((item): item is { fileName: string; number: number } => !isUndefined(item.number))
		.sort((a, b) => a.number - b.number || naturalCompare(a.fileName, b.fileName));
	const rest = parsed
		.filter((item) => isUndefined(item.number))
		.sort((a, b) => naturalCompare(a.fileName, b.fileName));
	return [...numbered, ...rest].map((item) => item.fileName);
}

/**
 * 用集号做确证式映射。
 *
 * 与「按位置顺延」的区别：本地缺集时后续文件仍保留各自真实集号，不会整体错位。
 * 缺集属于正常状态（用户没下载），只记录到 `missing`，不阻断对齐。
 *
 * 返回 `resolved: false` 表示规则不敢下结论，而不是「一个都对不上」：`assignments` 里
 * 仍然保留能被确证的文件，供模型不可用时兜底展示。四种情形会放弃——文件名带特别篇
 * 标记、集号解析不出、集号重复、集号在官方正片里不存在。最后一种同时覆盖了合并集、
 * 编号体系不同、以及集号其实是特别篇。
 */
export function alignByRules(files: string[], official: OfficialEpisode[]): RuleAlignment {
	const notes: string[] = [];
	const missing: OfficialEpisode[] = [];
	const assignments = new Map<string, OfficialEpisode>();
	const reasons: string[] = [];

	const mainBySort = new Map<number, OfficialEpisode>();
	for (const episode of official) {
		if (episode.kind === 'main') {
			mainBySort.set(episode.sort, episode);
		}
	}

	// 先分三类，再逐类判定：只有「无标记 + 集号唯一 + 官方正片里存在」三条同时满足才落归属
	const marked: string[] = [];
	const unparsed: string[] = [];
	const numbered: Array<{ fileName: string; number: number }> = [];
	for (const fileName of files) {
		// 走了 AI 反而更准：文件名写了特别篇，编号与官方分类就不再是等值关系
		if (hasSpecialMarker(fileName)) {
			marked.push(fileName);
			continue;
		}
		const number = parseEpisodeNumber(fileName);
		if (isUndefined(number)) {
			unparsed.push(fileName);
			continue;
		}
		numbered.push({ fileName, number });
	}

	const counts = new Map<number, number>();
	for (const item of numbered) {
		counts.set(item.number, (counts.get(item.number) ?? 0) + 1);
	}
	const duplicated = [...counts].filter(([, count]) => count > 1).map(([number]) => number);

	const unknown: string[] = [];
	for (const item of numbered) {
		// 同号文件谁都不认：无法判断哪一个是真正的第 N 集
		if (duplicated.includes(item.number)) {
			continue;
		}
		const episode = mainBySort.get(item.number);
		if (!episode) {
			unknown.push(`${item.fileName}(${item.number})`);
			continue;
		}
		assignments.set(item.fileName, episode);
	}

	if (marked.length) {
		reasons.push(`文件名带特别篇标记，归属交由模型判定：${marked.join('、')}`);
	}
	if (unparsed.length) {
		reasons.push(`无法从文件名解析集号：${unparsed.join('、')}`);
	}
	if (duplicated.length) {
		reasons.push(`本地集号重复：${duplicated.join('、')}`);
	}
	if (unknown.length) {
		reasons.push(`集号在官方正片里不存在：${unknown.join('、')}`);
	}

	const usedMain = new Set([...assignments.values()].map((episode) => episode.episodeId));
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
	// 特别篇不参与规则匹配：官方有、本地也可能有，归属需要语义判断，这里只提示数量
	const specialCount = official.filter((episode) => episode.kind === 'special').length;
	if (specialCount) {
		notes.push(`官方另有 ${specialCount} 个特别篇，未参与本次匹配`);
	}

	return { resolved: reasons.length === 0, reason: reasons.join('；'), assignments, missing, notes };
}
