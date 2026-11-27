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

export const ALIGN_SYSTEM = `你是动画文件校对助手。把本地一个季目录里的每个视频文件，对应到官方剧集列表中的一条，或判定为无对应。

输入（紧凑数组）：
- f：本地文件 [id, 文件名, 集号(-1=解析不出)]。数组顺序已经是最终播放顺序，由文件名编号升序决定。
- o：官方剧集 [id, 集号, 标题]；附加特别篇为 [id,"sp",序号,标题]。数组顺序即播出顺序。
- 集号是季度内连续的真实集号，跨条目连续。集号 0 表示第 0 话，属于正片。

顺序规则（先读这一节）：
1. 你只负责「文件 → 官方集」的对应关系，用来取标题，不要参与决定播放顺序。
2. 播放顺序由本地文件名的编号决定，不要因为官方集号不同就调整对应关系。
3. 文件名里的编号就是集号：00-特别篇.mp4 的 00 是第 0 集，排在 01 之前，和 01、02 一样属于正片，不是附加特别篇。
4. 文件名里出现「特别篇 / SP / OVA / OAD / 番外」不代表它是附加特别篇。先看编号：编号在正片序列里连续占位的是正片；没有编号、也不占正片集号的内容才是附加特别篇。
5. 如果你认为某个文件排错了（例如文件名编号写错），不要靠映射去纠正顺序，把它写进 reason，留给人工处理。

对应规则：
1. f 的每个 id 都必须出现在 map 里，值为 o 的 id 或 null。
2. 每个 o 的 id 最多用一次。
3. 判定顺序：文件名集号 → 方括号标记 → 前缀编号 → 标题语义。
4. 正片数不等时不要按位置平移。缺失处留空，让后续文件保留各自真实集号。
5. 不确定就返回 null，并在 reason 指出哪些文件不确定。
6. 只输出 JSON，不要解释、不要代码块：{"map":{"f1":"k1"},"reason":""}`;

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
		const order = typeof item?.order === 'number' && Number.isInteger(item.order) ? item.order : undefined;
		if (order !== undefined) {
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
		orders.every((order) => order !== undefined) &&
		[...orders].sort((a, b) => a! - b!).every((order, index) => order === expected[index]);
	if (!orderValid) {
		warnings.push('季顺序不是 1..N 的完整排列，已按目录顺序排列，请手动确认');
	}

	const notes =
		typeof (content as { notes?: unknown })?.notes === 'string' ? (content as { notes: string }).notes.trim() : '';
	return { seasons: result, notes, warnings };
}

export interface AlignResult {
	/** 文件名 → 官方剧集；null 表示模型认为无对应 */
	map: Map<string, OfficialEpisode | null>;
	reason: string;
	warnings: string[];
}

/**
 * 校验集对齐结果：每个本地文件恰好出现一次，官方集不被重复使用，返回值在集合内。
 *
 * 与季映射不同，这里不要求「全部官方集都被用上」——缺集是正常状态，
 * 只要每个文件都有明确结论即可。
 */
export function parseAlignResult(content: unknown, files: string[], official: OfficialEpisode[]): AlignResult {
	const warnings: string[] = [];
	const map = new Map<string, OfficialEpisode | null>();
	const raw = (content as { map?: unknown })?.map;
	if (!raw || typeof raw !== 'object') {
		return { map, reason: '', warnings: ['AI 未返回 map 对象'] };
	}
	// 模型回传的是 k1..kN，这里先建索引，避免按 id 反查时退化成 O(n²)
	const byEpisodeId = new Map<string, OfficialEpisode>();
	official.forEach((episode, index) => byEpisodeId.set(`k${index + 1}`, episode));

	const byFileId = new Map<string, string>();
	for (const [fileId, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value !== 'string') {
			warnings.push(`${fileId} 的返回值不是官方集 id，已忽略`);
			continue;
		}
		byFileId.set(fileId, value);
	}

	const usedEpisode = new Set<string>();
	for (let index = 0; index < files.length; index++) {
		const fileId = `f${index + 1}`;
		const fileName = files[index]!;
		const episodeKey = byFileId.get(fileId);
		if (episodeKey === undefined) {
			warnings.push(`${fileName} 未出现在 map 中，视为无对应`);
			map.set(fileName, null);
			continue;
		}
		if (!episodeKey) {
			map.set(fileName, null);
			continue;
		}
		const matched = byEpisodeId.get(episodeKey);
		if (!matched) {
			warnings.push(`${fileName} 指向不存在的官方集 ${episodeKey}，视为无对应`);
			map.set(fileName, null);
			continue;
		}
		if (usedEpisode.has(episodeKey)) {
			warnings.push(`官方集 ${episodeKey} 被重复分配，${fileName} 视为无对应`);
			map.set(fileName, null);
			continue;
		}
		usedEpisode.add(episodeKey);
		map.set(fileName, matched);
	}
	const reason =
		typeof (content as { reason?: unknown })?.reason === 'string'
			? (content as { reason: string }).reason.trim()
			: '';
	return { map, reason, warnings };
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
		{ role: 'user', content: `${JSON.stringify(payload)}\n只输出 {"map":{...},"reason":""}` },
	];
}
