/**
 * 与模型交互的输入构造与输出校验。
 *
 * 这里定义「给模型看什么」和「模型应该返回什么」，两侧都必须是可单测的纯函数：
 * 提示词一旦和业务逻辑搅在一起，调整一句话就可能悄悄改变落库结果。
 *
 * 两个任务：
 * 1. **季映射**：本地季目录 → Bangumi 条目（split cour 一个季可能对应多个条目）；
 * 2. **集对齐**：本地文件 → 官方剧集，仅用于取标题，不参与排序。
 */
import { isUndefined } from '@wang-yige/utils';
import type { ChatMessage } from '../ai/client';
import type { OfficialEpisode } from './align';

/** 一个本地季目录的摘要，只传模型需要判断的字段 */
export interface LocalSeasonSummary {
	/** 季别名 s1、s2……模型用它回传结果 */
	alias: string;
	/** 相对系列目录的路径，例如 `无职转生/第1季` */
	relativePath: string;
	fileCount: number;
	/** 无法解析集号且带特别篇标记的文件数 */
	specialCount: number;
	/** 用于判断命名风格的样例文件名 */
	sampleFiles: string[];
}

export interface MatchCandidate {
	id: number;
	name: string;
	nameCn: string;
	date?: string;
	eps?: number;
}

export const MATCH_SYSTEM = `你是动画季目录与 Bangumi 条目的匹配助手。

输入（紧凑数组）：
- series：本地系列标题
- seasons：每项 [季别名, 目录路径, 视频文件数, 特别篇数, 3 个样例文件名]
- candidates：每项 [条目id, 原名, 中文名, 首播日, 本篇话数]

任务：为每个季给出 order 与 subjectIds。
- order 是该季在整部作品中的时间顺序，从 1 开始，必须覆盖 1..N 且不重复。
- subjectIds 按播出顺序列出该季对应的全部条目：单一条目长度为 1；该季由分割放送的多部分拼成时列出全部（最多 3 个）。
- 只能使用 candidates 中出现的 id，不要编造。
- 判定依据：话数是否吻合（本地文件数 ≈ 各条目话数之和）、目录名含义、条目名与首播日先后。话数差异过大时不要强行对应。
- 同一部作品的不同季可能共享作品名前缀，注意区分「第2部分」这类同一季的分割放送。
- 无法确定时 subjectIds 返回空数组。

只输出 JSON，不要解释、不要代码块：{"seasons":[{"alias":"s1","order":1,"subjectIds":[123]}],"notes":""}`;

export const ALIGN_SYSTEM = `你是动画文件校对助手。把本地季目录里的每个视频文件对应到官方剧集（或判定为无对应）；一个文件装了连续几集时，为它合并这几集的标题。

输入（紧凑数组）：
- f：本地文件 [id, 文件名, 集号(-1=解析不出)]，顺序为播放顺序。集号由文件名解析得出，**只是提示**，不保证等于官方集号。
- o：官方剧集 [id, 集号, 标题]；特别篇 [id,"sp",序号,标题]，顺序即播出顺序。

判定规则：
1. 你只决定「文件 → 官方集」，不决定播放顺序。
2. 文件名常是发布组原名（[组名] 作品名 - 05 [1080p]）：数字属于发布组习惯，官方无此集号时不要硬套，按标题语义与其他文件的相对位置判断。
3. 文件名含「特别篇/SP/OVA/OAD/番外」时不要仅凭编号判成正片：先找该集号的正片集，再找特别篇；冲突时以官方分类为准。
4. 文件数与正片数不等可能是缺集，也可能有文件装了多集：只有文件名写着连续区间（01-03、S01E01-E03）才用数组，其余按单集。
5. f 的每个 id 都要出现在 map：单个 o 的 id、id 数组，或 null。每个 o 的 id 最多用一次。
6. 不要按位置平移：缺失处留空，后续文件保留真实集号。
7. 拿不准返回 null，并在 reason 指出哪些文件不确定。
8. 数组文件要在 titles 给合并标题：保留各集要点、重复作品名只留一次、用「／」连接、不编造，≤80 字。

只输出 JSON，不要解释、不要代码块：{"map":{"f1":"k1"},"titles":{"f1":"..."},"reason":""}`;

export function buildMatchMessages(
	seriesTitle: string,
	seasons: LocalSeasonSummary[],
	candidates: MatchCandidate[],
): ChatMessage[] {
	// 紧凑数组：键名在几十条记录上是纯开销，位置数组能压掉大半输入
	const payload = {
		series: seriesTitle,
		seasons: seasons.map((season) => [
			season.alias,
			season.relativePath,
			season.fileCount,
			season.specialCount,
			season.sampleFiles,
		]),
		candidates: candidates.map((item) => [item.id, item.name, item.nameCn, item.date ?? '', item.eps ?? 0]),
	};
	return [
		{ role: 'system', content: MATCH_SYSTEM },
		{ role: 'user', content: `${JSON.stringify(payload)}\n只输出 {"seasons":[...],"notes":""}` },
	];
}

export interface SeasonMatch {
	alias: string;
	/** 季在作品中的时间顺序，从 1 开始 */
	order: number | undefined;
	/** 该季对应的条目 id，按播出顺序 */
	subjectIds: number[];
}

export interface MatchResult {
	seasons: SeasonMatch[];
	notes: string;
	warnings: string[];
}

/**
 * 校验季映射结果。
 *
 * 只做结构性校验：别名存在且不重复、id 不超过 3 个、id 在候选集合内、order 是 1..N 的排列。
 * 具体某季配哪个条目属于内容判断，交给用户在预览里确认，这里不臆测。
 */
export function parseMatchResult(content: unknown, seasons: LocalSeasonSummary[], candidateIds: number[]): MatchResult {
	const warnings: string[] = [];
	const aliases = new Set(seasons.map((season) => season.alias));
	const allowed = new Set(candidateIds);
	const list = Array.isArray((content as { seasons?: unknown })?.seasons)
		? ((content as { seasons: unknown[] }).seasons as Array<Record<string, unknown>>)
		: [];

	const byAlias = new Map<string, Record<string, unknown>>();
	for (const item of list) {
		const alias = typeof item?.alias === 'string' ? item.alias : '';
		if (!aliases.has(alias)) {
			warnings.push(`AI 返回未知季别名：${alias || '(空)'}`);
			continue;
		}
		if (byAlias.has(alias)) {
			warnings.push(`AI 重复返回季：${alias}`);
			continue;
		}
		byAlias.set(alias, item);
	}

	const usedIds = new Map<number, string>();
	const usedOrders = new Map<number, string>();
	const result: SeasonMatch[] = [];
	for (const season of seasons) {
		const item = byAlias.get(season.alias);
		const rawIds = Array.isArray(item?.subjectIds) ? (item!.subjectIds as unknown[]) : [];
		const ids: number[] = [];
		for (const value of rawIds) {
			if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
				continue;
			}
			if (!allowed.has(value)) {
				warnings.push(`条目 ${value} 不在候选列表中，已忽略`);
				continue;
			}
			if (usedIds.has(value)) {
				warnings.push(`条目 ${value} 被同时分配给 ${usedIds.get(value)} 与 ${season.relativePath}`);
				continue;
			}
			usedIds.set(value, season.relativePath);
			ids.push(value);
		}
		if (ids.length > 3) {
			warnings.push(`${season.relativePath}：给出 ${ids.length} 个条目，超过 3 个上限，已截断`);
		}
		const order = typeof item?.order === 'number' && Number.isInteger(item.order) ? item.order : void 0;
		if (!isUndefined(order)) {
			if (usedOrders.has(order)) {
				warnings.push(`order ${order} 重复：${usedOrders.get(order)} 与 ${season.relativePath}`);
			} else {
				usedOrders.set(order, season.relativePath);
			}
		}
		if (!ids.length) {
			warnings.push(`${season.relativePath}：未匹配到条目，需要手动指定`);
		}
		result.push({ alias: season.alias, order, subjectIds: ids.slice(0, 3) });
	}

	// order 必须是 1..N 的排列，否则季顺序不可信，交给前端按目录顺序兜底
	const orders = result.map((item) => item.order);
	const expected = seasons.map((_, index) => index + 1);
	const orderValid =
		orders.every((order) => !isUndefined(order)) &&
		[...orders].sort((a, b) => a! - b!).every((order, index) => order === expected[index]);
	if (!orderValid) {
		warnings.push('季顺序不是 1..N 的完整排列，已按目录顺序排列，请手动确认');
	}

	const notes =
		typeof (content as { notes?: unknown })?.notes === 'string' ? (content as { notes: string }).notes.trim() : '';
	return { seasons: result, notes, warnings };
}

/** 合并标题的长度上限：日语标题本身偏长，只做防御性判断，不做裁剪 */
const MAX_MERGED_TITLE = 120;

export interface AlignResult {
	/** 文件名 → 官方剧集；null 表示模型认为无对应 */
	map: Map<string, OfficialEpisode | null>;
	/** 合并集：文件名 → 覆盖的多集，仅当一个文件对应 2 集以上时出现 */
	merged: Map<string, OfficialEpisode[]>;
	/** 合并集标题：文件名 → 模型给出的合并结果；模型没给标题的合并不在此表 */
	titles: Map<string, string>;
	reason: string;
	warnings: string[];
}

/**
 * 校验集对齐结果：每个本地文件恰好出现一次，官方集不被重复使用，返回值在集合内。
 *
 * 与季映射不同，这里不要求「全部官方集都被用上」——缺集是正常状态，
 * 只要每个文件都有明确结论即可。
 *
 * 值可以是单个 k 键、k 键数组或 null。数组表示「这个文件装了连续几集」，
 * 判断与合并标题都由模型负责；数组里任一项不合法时整条按「无对应」处理，不做部分采纳。
 */
export function parseAlignResult(content: unknown, files: string[], official: OfficialEpisode[]): AlignResult {
	const warnings: string[] = [];
	const map = new Map<string, OfficialEpisode | null>();
	const merged = new Map<string, OfficialEpisode[]>();
	const titles = new Map<string, string>();
	const raw = (content as { map?: unknown })?.map;
	if (!raw || typeof raw !== 'object') {
		return { map, merged, titles, reason: '', warnings: ['AI 未返回 map 对象'] };
	}
	// 模型回传的是 k1..kN，这里先建索引，避免按 id 反查时退化成 O(n²)
	const byEpisodeKey = new Map<string, OfficialEpisode>();
	official.forEach((episode, index) => byEpisodeKey.set(`k${index + 1}`, episode));
	const rawTitles = (content as { titles?: unknown })?.titles;
	const mergedTitles = (rawTitles && typeof rawTitles === 'object' ? rawTitles : {}) as Record<string, unknown>;

	const byFileId = new Map<string, string[]>();
	for (const [fileId, value] of Object.entries(raw as Record<string, unknown>)) {
		// null 是提示词约定的「无对应」，不告警
		if (value === null) {
			byFileId.set(fileId, []);
			continue;
		}
		if (typeof value === 'string') {
			byFileId.set(fileId, [value]);
			continue;
		}
		if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
			byFileId.set(fileId, value as string[]);
			continue;
		}
		warnings.push(`${fileId} 的返回值不是官方集 id，已忽略`);
	}

	const usedEpisode = new Set<string>();
	for (let index = 0; index < files.length; index++) {
		const fileId = `f${index + 1}`;
		const fileName = files[index]!;
		const keys = byFileId.get(fileId);
		if (isUndefined(keys)) {
			warnings.push(`${fileName} 未出现在 map 中，视为无对应`);
			map.set(fileName, null);
			continue;
		}
		if (!keys.length) {
			map.set(fileName, null);
			continue;
		}
		const episodes: OfficialEpisode[] = [];
		let invalid = false;
		for (const key of keys) {
			const matched = byEpisodeKey.get(key);
			if (!matched) {
				warnings.push(`${fileName} 指向不存在的官方集 ${key}，视为无对应`);
				invalid = true;
				break;
			}
			if (usedEpisode.has(key) || episodes.some((item) => item.episodeId === matched.episodeId)) {
				warnings.push(`官方集 ${key} 被重复分配，${fileName} 视为无对应`);
				invalid = true;
				break;
			}
			episodes.push(matched);
		}
		if (invalid) {
			map.set(fileName, null);
			continue;
		}
		for (const key of keys) {
			usedEpisode.add(key);
		}
		map.set(fileName, episodes[0]!);
		if (episodes.length > 1) {
			merged.set(fileName, episodes);
			const value = mergedTitles[fileId];
			const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
			if (title && title.length <= MAX_MERGED_TITLE) {
				titles.set(fileName, title);
			} else {
				warnings.push(`${fileName} 判定为 ${episodes.length} 集合并，但没有可用的合并标题，将用首集标题`);
			}
		}
	}
	const reason =
		typeof (content as { reason?: unknown })?.reason === 'string'
			? (content as { reason: string }).reason.trim()
			: '';
	return { map, merged, titles, reason, warnings };
}

/** 构造集对齐输入：文件名与截图顺序一致，模型用 f1..fN 回传 */
export function buildAlignMessages(
	seasonPath: string,
	files: string[],
	official: OfficialEpisode[],
	episodeNumber: (fileName: string) => number | undefined,
): ChatMessage[] {
	const payload = {
		season: seasonPath,
		localFiles: files.map((fileName, index) => [`f${index + 1}`, fileName, episodeNumber(fileName) ?? -1]),
		official: official.map((item, index) =>
			item.kind === 'main'
				? [`k${index + 1}`, item.sort, item.title]
				: [`k${index + 1}`, 'sp', item.sort, item.title],
		),
	};
	return [
		{ role: 'system', content: ALIGN_SYSTEM },
		{ role: 'user', content: `${JSON.stringify(payload)}\n只输出 {"map":{...},"titles":{...},"reason":""}` },
	];
}
