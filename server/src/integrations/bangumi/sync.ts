/**
 * Bangumi 同步的编排层。
 *
 * 三段式，前两段都不写库：
 * 1. `runMatch`：搜索 + AI 季映射，得到「本地季 → 条目」的建议，等人工确认；
 * 2. `runPreview`：按确认后的映射拉详情与剧集，生成 changeSet，等人工确认；
 * 3. `applyChangeSet`：校验后写入，失败整次不落盘。
 *
 * 数据流的核心决定：**顺序由本地文件名决定，官方数据只提供标题与对应关系**。
 * 因此这里不把 Bangumi 的 `sort` 写进任何字段，落库的 `sort` 是 `1..N` 位置号。
 */
import { Status } from '~shared/http-status';
import type { EpisodeKind } from '~shared/episode-kind';
import type { Series } from '~server/data/series';
import type { Season } from '~server/data/season';
import type { Episode } from '~server/data/episode';
import { seriesTypes } from '~shared/series-types';
import { isWritableSeriesStatus } from '~shared/series-status';
import { ApiError } from '~server/src/error';
import { chatJson, extractJsonObject } from '../ai/client';
import { getSubject, getSubjectEpisodes, searchSubjects } from './client';
import { alignByRules, collectOfficialEpisodes, orderLocalFiles } from './align';
import type { OfficialEpisode, OfficialPart } from './align';
import { parseEpisodeNumber } from './filenames';
import { buildAlignMessages, buildMatchMessages, parseAlignResult, parseMatchResult } from './prompts';
import type { LocalSeasonSummary, MatchCandidate } from './prompts';
import { buildTagMessages, matchTagsByRules, parseTagResult } from './tags';
import type { BangumiEpisode, BangumiSubjectSummary } from './types';

/** 一个本地季的输入：数据层只负责提供集 id 与文件名，不在这里做任何推断 */
export interface LocalSeasonInput {
	seasonId: string;
	/** 季目录名，UI 上显示为相对路径 */
	path: string;
	/** 当前季标题，预览里作为「修改前」展示 */
	title: string;
	episodes: Array<{ id: string; fileName: string }>;
}

/** 季与条目的确认结果 */
export interface SeasonMappingInput {
	seasonId: string;
	subjectIds: number[];
}

export interface MatchSeasonResult {
	seasonId: string;
	path: string;
	fileCount: number;
	specialCount: number;
	sampleFiles: string[];
	/** AI 建议的季顺序，未给出时为 undefined */
	order?: number;
	/** AI 建议的条目 id */
	subjectIds: number[];
}

export interface MatchResult {
	seriesId: string;
	seriesName: string;
	seasons: MatchSeasonResult[];
	candidates: MatchCandidate[];
	notes: string;
	warnings: string[];
}

export interface PreviewEpisode {
	episodeId: string;
	fileName: string;
	/** 落库位置，从 1 开始 */
	position: number;
	/** 官方播出序号，仅用于核对 */
	officialSort: number | null;
	kind: 'main' | 'special' | 'unmatched';
	/** 写入的标题；未匹配时为文件名去扩展名；合并集为 AI 合并后的标题 */
	title: string;
	/** 官方标题，未匹配时为空；合并集为各集标题的拼接 */
	officialTitle: string;
	/** 合并集覆盖的集数，0 表示普通文件 */
	coveredCount: number;
	/** 合并集覆盖的各集标题，按播出顺序；普通文件为空数组 */
	coveredTitles: string[];
}

export interface PreviewSeason {
	seasonId: string;
	path: string;
	fromTitle: string;
	title: string;
	/** 规则对齐 / AI 对齐 / 存在未匹配文件 */
	alignment: 'rule' | 'ai' | 'partial';
	episodes: PreviewEpisode[];
	missing: Array<{ kind: 'main' | 'special'; sort: number; title: string }>;
	notes: string[];
	warnings: string[];
}

export interface PreviewSeries {
	title: string;
	description: string;
	date: [number, number] | null;
	status: number;
	types: number[];
	typesMatched: string[];
	typesUnmatched: string[];
}

export interface PreviewResult {
	seriesId: string;
	series: PreviewSeries;
	seasons: PreviewSeason[];
	warnings: string[];
}

/** 应用时前端回传的结构；字段缺省表示不修改 */
export interface ApplyInput {
	series?: {
		title?: string;
		description?: string;
		date?: { year: number; month: number } | null;
		status?: number;
		types?: number[];
	};
	seasons?: Array<{
		seasonId: string;
		title?: string;
		order?: string[];
		episodes?: Array<{ episodeId: string; title: string; kind?: EpisodeKind }>;
	}>;
}

export interface ApplyResult {
	series: string[];
	seasons: Array<{ seasonId: string; title: boolean; order: number; episodes: number }>;
}

/**
 * 读取合并组（主系列 + 被合并系列）的季与集。
 *
 * 只提供 id 与文件名：顺序、分类都在整合层按文件名推导，
 * 数据层不参与任何「哪一集是第几集」的判断。
 *
 * 成员系列的季在 `path` 前带上系列名：主系列与成员可能有同名季目录（都叫「正片」），
 * 不带来源时界面上分不出是哪一个，模型也无法据此对齐。
 */
export async function readLocalSeasons(group: Series[]): Promise<LocalSeasonInput[]> {
	const result: LocalSeasonInput[] = [];
	for (const [index, series] of group.entries()) {
		// 数据层的字段 getter 都是 Promise，漏 await 会拼出 `[object Promise]`
		const prefix = index === 0 ? '' : await series.title;
		for (const season of await series.seasons) {
			const episodes = await season.episodes;
			const seasonName = season.getSeasonName();
			result.push({
				seasonId: await season.id,
				path: prefix ? `${prefix} / ${seasonName}` : seasonName,
				title: await season.title,
				episodes: await Promise.all(
					episodes.map(async (episode) => ({ id: await episode.id, fileName: episode.getEpisodeName() })),
				),
			});
		}
	}
	return result;
}

/** Bangumi 的 summary 里带 BBCode 风格的引用块，去掉后才是可读描述 */
export function stripSummary(summary?: string) {
	if (!summary) {
		return '';
	}
	const lines = summary
		.replace(/\[url=[^\]]*\]/gi, '')
		.replace(/\[\/url\]/gi, '')
		.split('\n')
		.map((line) => line.trim());
	return lines.filter((line) => line && !/^[=\-—]{3,}$/.test(line)).join('\n');
}

/** `2021-01-10` → `[2021, 1]`；无法解析时返回 null，不猜年份 */
export function parseDate(value?: string): [number, number] | null {
	const match = value?.match(/^(\d{4})-(\d{2})/);
	if (!match) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1900) {
		return null;
	}
	return [year, month];
}

/**
 * 由剧集播出日期推导系列状态。
 *
 * 用官方剧集而不是本地文件：本地文件可能缺集，状态描述的是作品本身。
 * 全部集都没有日期时返回 0（未设置），不猜。
 */
export function deriveStatus(episodes: BangumiEpisode[], today = new Date()): { status: number; reason: string } {
	const dates = episodes
		.map((episode) => episode.airdate)
		.filter((value): value is string => Boolean(value))
		.map((value) => Date.parse(value))
		.filter((value) => Number.isFinite(value));
	if (!dates.length) {
		return { status: 0, reason: '官方剧集没有播出日期' };
	}
	const first = Math.min(...dates);
	const last = Math.max(...dates);
	const now = today.getTime();
	if (first > now) {
		return { status: 4, reason: '首播日期在未来' };
	}
	if (last > now) {
		return { status: 2, reason: '仍有未播出的集' };
	}
	return { status: 3, reason: '全部剧集已播出' };
}

/** 本地文件名摘要，供季映射使用；不传完整列表，控制输入体积 */
export function summarizeSeason(season: LocalSeasonInput, alias: string): LocalSeasonSummary {
	const files = orderLocalFiles(season.episodes.map((episode) => episode.fileName));
	const unnumbered = files.filter((fileName) => parseEpisodeNumber(fileName) === undefined);
	return {
		alias,
		relativePath: season.path,
		fileCount: season.episodes.length,
		specialCount: unnumbered.length,
		sampleFiles: [...files.slice(0, 2), ...files.slice(-1)],
	};
}

/**
 * 生成单季预览。
 *
 * 顺序始终取自本地文件名。规则能给出唯一归属且文件数与官方集数一致时用规则结果；
 * 否则用 AI 的对应关系——合并集只可能来自 AI，由模型判断哪几个文件装了几集。
 * 未匹配的文件保留在列表末尾并带原文件名标题，不会被静默丢弃。
 */
export function buildSeasonPreview(
	season: LocalSeasonInput,
	official: OfficialEpisode[],
	aiAlign?: Map<string, OfficialEpisode | null>,
	aiMerged?: Map<string, OfficialEpisode[]>,
	aiTitles?: Map<string, string>,
): PreviewSeason {
	const byFileName = new Map(season.episodes.map((episode) => [episode.fileName, episode.id]));
	const files = season.episodes.map((episode) => episode.fileName);
	const ordered = orderLocalFiles(files);
	const ruled = alignByRules(ordered, official);
	// 模型可能整季都判无对应，这种结果没有信息量，退回规则结果
	const aiApplied = Boolean(aiAlign && [...aiAlign.values()].some(Boolean));
	const mergedMap = aiApplied ? aiMerged : undefined;
	const titlesMap = aiApplied ? aiTitles : undefined;

	let assignments = ruled.assignments;
	let alignment: PreviewSeason['alignment'] = 'rule';
	const notes = [...ruled.notes];
	const warnings: string[] = [];

	if (aiApplied) {
		assignments = new Map();
		for (const [fileName, episode] of aiAlign!) {
			if (episode) {
				assignments.set(fileName, episode);
			}
		}
		alignment = 'ai';
		notes.push(ruled.resolved ? '本地文件数与官方集数不一致，对应关系由 AI 确认' : `规则无法对齐：${ruled.reason}`);
	} else if (!ruled.resolved) {
		notes.push(`规则无法对齐：${ruled.reason}；请手动确认`);
		alignment = 'partial';
	}

	const episodes: PreviewEpisode[] = ordered.map((fileName, index) => {
		const episode = assignments.get(fileName);
		const episodeId = byFileName.get(fileName);
		const coveredTitles = (mergedMap?.get(fileName) ?? []).map((item) => item.title);
		if (!episodeId) {
			// 数据层的集列表与文件列表不一致属于内部错误，宁可中止也不写出错位的排序
			throw new ApiError(Status.InternalServerError, `文件 ${fileName} 没有对应的集记录，请先刷新系列`);
		}
		if (!episode) {
			return {
				episodeId,
				fileName,
				position: index + 1,
				officialSort: null,
				kind: 'unmatched',
				title: fileName.replace(/\.[^.]+$/, ''),
				officialTitle: '',
				coveredCount: 0,
				coveredTitles: [],
			};
		}
		const merged = coveredTitles.length > 1;
		const fallback = episode.title || fileName.replace(/\.[^.]+$/, '');
		return {
			episodeId,
			fileName,
			position: index + 1,
			officialSort: episode.sort,
			kind: episode.kind,
			// 合并标题由模型给出；没给时用首集标题，留给人工在预览里确认
			title: merged ? (titlesMap?.get(fileName) ?? fallback) : fallback,
			officialTitle: merged ? coveredTitles.join(' / ') : episode.title,
			coveredCount: merged ? coveredTitles.length : 0,
			coveredTitles: merged ? coveredTitles : [],
		};
	});

	if (episodes.some((episode) => episode.kind === 'unmatched')) {
		alignment = 'partial';
		warnings.push('存在未对应到官方剧集的文件，已排在末尾并保留原文件名，请手动确认');
	}

	return {
		seasonId: season.seasonId,
		path: season.path,
		fromTitle: season.title,
		title: season.title,
		alignment,
		episodes,
		missing: ruled.missing.map((episode) => ({ kind: episode.kind, sort: episode.sort, title: episode.title })),
		notes,
		warnings,
	};
}

/** 匹配候选去重并按首播日期排序，同时出现的条目顺序会影响 split cour 的拼接 */
export function normalizeCandidates(rows: BangumiSubjectSummary[]): MatchCandidate[] {
	const seen = new Set<number>();
	const result: MatchCandidate[] = [];
	for (const row of rows) {
		if (seen.has(row.id)) {
			continue;
		}
		seen.add(row.id);
		result.push({
			id: row.id,
			name: row.name,
			nameCn: row.name_cn,
			date: row.date,
			eps: row.eps,
		});
	}
	return result.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id);
}

/** 按首播日期给条目排序，保证 split cour 的 partIndex 与播出顺序一致 */
export function orderSubjects(subjectIds: number[], details: Map<number, BangumiSubjectSummary>) {
	return [...subjectIds].sort((a, b) => {
		const left = details.get(a)?.date ?? '';
		const right = details.get(b)?.date ?? '';
		return left.localeCompare(right) || a - b;
	});
}

/** 把多个条目的剧集拼成官方序列 */
export function buildOfficial(orderedIds: number[], episodesBySubject: Map<number, BangumiEpisode[]>): OfficialPart[] {
	return orderedIds.map((subjectId, index) => ({
		subjectId,
		partIndex: index,
		episodes: episodesBySubject.get(subjectId) ?? [],
	}));
}

/** 拉取条目详情与剧集；任一条目失败时明确报错，不生成半套映射 */
export async function loadSubjects(subjectIds: number[]) {
	const details = new Map<number, BangumiSubjectSummary>();
	const episodes = new Map<number, BangumiEpisode[]>();
	for (const id of subjectIds) {
		const detail = await getSubject(id);
		if (!detail) {
			throw new ApiError(Status.NotFound, `Bangumi 条目 ${id} 不存在`);
		}
		if (detail.type !== 2) {
			throw new ApiError(Status.Failed, `Bangumi 条目 ${id} 不是动画（type=${detail.type}）`);
		}
		details.set(id, detail);
		episodes.set(id, await getSubjectEpisodes(id));
	}
	return { details, episodes };
}

/** 关键词去重：中文名、原名、系列标题都试一次 */
/**
 * 搜索关键词：主系列的标题与目录名，外加被合并系列的名字。
 *
 * 合并进来的往往就是续作或同一作品的不同写法（「微速前进」/「微速前行！」），
 * 只拿主系列名去搜会把另一部作品漏掉。
 */
export function buildKeywords(seriesName: string, seriesTitle: string, extraTitles: string[] = []) {
	return [...new Set([seriesTitle, seriesName, ...extraTitles].map((value) => value.trim()).filter(Boolean))];
}

export async function searchCandidates(keywords: string[]) {
	const rows: BangumiSubjectSummary[] = [];
	for (const keyword of keywords) {
		rows.push(...(await searchSubjects(keyword)));
	}
	return normalizeCandidates(rows);
}

/** 季映射：只调一次模型；候选为空时不调用，直接返回告警 */
export async function runMatch(
	seriesName: string,
	seriesTitle: string,
	seasons: LocalSeasonInput[],
	extraTitles: string[] = [],
): Promise<MatchResult> {
	const candidates = await searchCandidates(buildKeywords(seriesName, seriesTitle, extraTitles));
	if (!candidates.length) {
		throw new ApiError(Status.BadGateway, `Bangumi 搜索无结果：${seriesTitle}`);
	}
	const summaries = seasons.map((season, index) => summarizeSeason(season, `s${index + 1}`));
	const { content, usage } = await chatJson(buildMatchMessages(seriesTitle, summaries, candidates));
	const parsed = parseMatchResult(
		extractJsonObject(content),
		summaries,
		candidates.map((item) => item.id),
	);
	const byAlias = new Map(parsed.seasons.map((item) => [item.alias, item]));

	return {
		seriesId: '',
		seriesName,
		seasons: seasons.map((season, index) => {
			const alias = `s${index + 1}`;
			const summary = summaries[index]!;
			const matched = byAlias.get(alias);
			return {
				seasonId: season.seasonId,
				path: season.path,
				fileCount: summary.fileCount,
				specialCount: summary.specialCount,
				sampleFiles: summary.sampleFiles,
				order: matched?.order,
				subjectIds: matched?.subjectIds ?? [],
			};
		}),
		candidates,
		notes: parsed.notes,
		warnings: [...parsed.warnings, `季映射消耗 ${usage?.total_tokens ?? '?'} tokens`],
	};
}

/** 标签映射：规则命中后，余下标签才调模型 */
export async function resolveTypes(metaTags: string[]) {
	const types = seriesTypes.map((type) => ({ id: type.id, name: type.name }));
	const ruled = matchTagsByRules(metaTags, types);
	if (!ruled.unmatched.length) {
		return { types: ruled.types, matched: [...metaTags], unmatched: [] as string[], warnings: [] as string[] };
	}
	const { content } = await chatJson(buildTagMessages(ruled.unmatched, types));
	const parsed = parseTagResult(extractJsonObject(content), types, ruled.unmatched);
	const hitNames = new Set(
		parsed.types
			.map((id) => types.find((type) => type.id === id)?.name)
			.filter((name): name is string => Boolean(name)),
	);
	return {
		types: types
			.filter((type) => ruled.types.includes(type.id) || parsed.types.includes(type.id))
			.map((type) => type.id),
		matched: [...hitNames],
		unmatched: parsed.ignored,
		warnings: parsed.warnings,
	};
}

/**
 * 生成整套预览。
 *
 * 顺序：先按首播日期排条目，再逐季对齐。任一季规则无法解决时调一次模型，
 * 并且只把该季的文件与官方集传过去，减少输入体积。
 */
export async function runPreview(mapping: SeasonMappingInput[], seasons: LocalSeasonInput[]): Promise<PreviewResult> {
	const seasonById = new Map(seasons.map((season) => [season.seasonId, season]));
	const warnings: string[] = [];

	const matchedSeasons = mapping.filter((item) => item.subjectIds.length);
	if (!matchedSeasons.length) {
		throw new ApiError(Status.Failed, '没有确认任何季与条目的对应关系');
	}
	for (const item of mapping) {
		if (!seasonById.has(item.seasonId)) {
			throw new ApiError(Status.Failed, `季 ${item.seasonId} 不属于当前系列`);
		}
	}

	const allSubjectIds = [...new Set(matchedSeasons.flatMap((item) => item.subjectIds))];
	const { details, episodes } = await loadSubjects(allSubjectIds);

	const firstDetail = details.get(orderSubjects(matchedSeasons[0]!.subjectIds, details)[0]!);
	if (!firstDetail) {
		throw new ApiError(Status.BadGateway, '无法读取第一个条目的详情');
	}

	const types = await resolveTypes(firstDetail.meta_tags ?? []);
	const previewSeasons: PreviewSeason[] = [];

	for (const item of matchedSeasons) {
		const season = seasonById.get(item.seasonId)!;
		const orderedIds = orderSubjects(item.subjectIds, details);
		const official = collectOfficialEpisodes(buildOfficial(orderedIds, episodes));
		let aiAlign: Map<string, OfficialEpisode | null> | undefined;
		let aiMerged: Map<string, OfficialEpisode[]> | undefined;
		let aiTitles: Map<string, string> | undefined;

		// 规则优先：能形成唯一归属就不调模型
		const ruled = alignByRules(
			season.episodes.map((episode) => episode.fileName),
			official,
		);
		// 合并集会减少文件数，所以只有「文件数少于官方集数」时才需要模型判断哪几个文件装了几集；
		// 其余情况规则已给出唯一归属，不额外花一次请求
		const mainCount = official.filter((episode) => episode.kind === 'main').length;
		if (!ruled.resolved || season.episodes.length < mainCount) {
			const files = orderLocalFiles(season.episodes.map((episode) => episode.fileName));
			const { content } = await chatJson(buildAlignMessages(season.path, files, official, parseEpisodeNumber));
			const parsed = parseAlignResult(extractJsonObject(content), files, official);
			aiAlign = parsed.map;
			aiMerged = parsed.merged;
			aiTitles = parsed.titles;
			warnings.push(...parsed.warnings.map((warning) => `${season.path}：${warning}`));
			if (parsed.reason) {
				warnings.push(`${season.path}：AI 备注 ${parsed.reason}`);
			}
		}

		const preview = buildSeasonPreview(season, official, aiAlign, aiMerged, aiTitles);
		preview.title = normalizeSeasonTitle(
			orderedIds.map((id) => details.get(id)?.name_cn || details.get(id)?.name || ''),
		);
		previewSeasons.push(preview);
		warnings.push(...preview.warnings, ...preview.notes);
	}

	const status = deriveStatus(allSubjectIds.flatMap((id) => episodes.get(id) ?? []));
	const date = parseDate(firstDetail.date);

	return {
		seriesId: '',
		series: {
			title: (firstDetail.name_cn || firstDetail.name || '').trim(),
			description: stripSummary(firstDetail.summary),
			date,
			status: status.status,
			types: types.types,
			typesMatched: types.matched,
			typesUnmatched: types.unmatched,
		},
		seasons: previewSeasons,
		warnings: [...warnings, ...types.warnings],
	};
}

/**
 * 季标题规范化。
 *
 * 一部作品的多条条目名通常只差「第2部分」「第二季」这类后缀，直接拼起来会得到一长串
 * 重复的作品名。这里取第一条的名字作为基底，后续条目只保留差异部分追加在后面。
 */
export function normalizeSeasonTitle(names: string[]) {
	const cleaned = names.map((name) => name.trim()).filter(Boolean);
	if (!cleaned.length) {
		return '';
	}
	if (cleaned.length === 1) {
		return cleaned[0]!;
	}
	const base = cleaned[0]!;
	const extras = cleaned
		.slice(1)
		.map((name) => {
			// 去掉与基底的公共前缀，只留下「第2部分」这类区分信息
			let index = 0;
			while (index < base.length && index < name.length && base[index] === name[index]) {
				index++;
			}
			return name
				.slice(index)
				.replace(/^[\s·・:：—-]+/, '')
				.trim();
		})
		.filter(Boolean);
	return extras.length ? `${base} ${extras.join(' / ')}` : base;
}

/**
 * 校验排序数组是否是「该季全部集的一个排列」。
 *
 * 长度不符、存在重复、或出现不属于该季的 id 都必须拒绝：`rewriteEpisodeOrder`
 * 会对未列出的集做末尾追加，如果这里放过缺项，用户看到的结果会与预览不一致。
 */
export function validateOrder(order: string[], allowedIds: string[]): { ok: true } | { ok: false; message: string } {
	if (order.length !== allowedIds.length) {
		return { ok: false, message: `排序数组必须包含该季全部 ${allowedIds.length} 个集` };
	}
	const allowed = new Set(allowedIds);
	const seen = new Set<string>();
	for (const id of order) {
		if (seen.has(id)) {
			return { ok: false, message: `排序数组存在重复集 ${id}` };
		}
		if (!allowed.has(id)) {
			return { ok: false, message: `集 ${id} 不属于该季` };
		}
		seen.add(id);
	}
	return { ok: true };
}

/**
 * 应用 changeSet。
 *
 * 入参是「主系列 + 被合并的成员系列」：季可能来自其中任何一个，
 * 因此按 `seasonId` 跨系列查找，写回各自的季；系列字段（标题、简介等）只写主系列。
 *
 * 校验在写之前完成：季与集必须属于这个合并组，`order` 必须是该季全部集的一个排列。
 * 任一校验失败整次中止，不产生半套数据。
 */
export async function applyChangeSet(group: Series[], input: ApplyInput): Promise<ApplyResult> {
	const main = group[0]!;
	const seasonById = new Map<string, Season>();
	for (const series of group) {
		for (const season of await series.seasons) {
			seasonById.set(await season.id, season);
		}
	}

	const result: ApplyResult = { series: [], seasons: [] };

	// 先做结构性校验，避免写到一半才发现 id 不属于这个合并组
	for (const item of input.seasons ?? []) {
		const season = seasonById.get(item.seasonId);
		if (!season) {
			throw new ApiError(Status.Failed, `季 ${item.seasonId} 不属于该系列`);
		}
		if (item.order) {
			const episodes = await season.episodes;
			const ids = await Promise.all(episodes.map((episode) => episode.id));
			const check = validateOrder(item.order, ids);
			if (!check.ok) {
				throw new ApiError(Status.Failed, `${item.seasonId}：${check.message}`);
			}
		}
		if (item.episodes) {
			const episodes = await season.episodes;
			const allowed = new Set(await Promise.all(episodes.map((episode) => episode.id)));
			for (const entry of item.episodes) {
				if (!allowed.has(entry.episodeId)) {
					throw new ApiError(Status.Failed, `集 ${entry.episodeId} 不属于季 ${item.seasonId}`);
				}
			}
		}
	}

	if (input.series?.status !== undefined && !isWritableSeriesStatus(input.series.status)) {
		throw new ApiError(Status.Failed, '系列状态无效');
	}
	if (input.series?.types) {
		const allowed = new Set(seriesTypes.map((type) => type.id));
		if (input.series.types.some((id) => !allowed.has(id))) {
			throw new ApiError(Status.Failed, '存在无效的系列类型');
		}
	}

	const applied = input.series ?? {};
	if (applied.title !== undefined) {
		await main.updateTitle(applied.title);
		result.series.push('title');
	}
	if (applied.description !== undefined) {
		await main.updateDescription(applied.description);
		result.series.push('description');
	}
	if (applied.date) {
		await main.updateDate(applied.date.year, applied.date.month);
		result.series.push('date');
	}
	if (applied.status !== undefined) {
		await main.updateStatus(applied.status);
		result.series.push('status');
	}
	if (applied.types) {
		await main.updateTypes(applied.types);
		result.series.push('types');
	}

	for (const item of input.seasons ?? []) {
		const season = seasonById.get(item.seasonId)!;
		let titleChanged = false;
		if (item.title) {
			await season.updateTitle(item.title);
			titleChanged = true;
		}
		if (item.episodes?.length) {
			const episodeById = new Map<string, Episode>();
			for (const episode of await season.episodes) {
				episodeById.set(await episode.id, episode);
			}
			for (const entry of item.episodes) {
				const episode = episodeById.get(entry.episodeId)!;
				await episode.updateTitle(entry.title);
				// 集类型与标题一起写：官方把某一集标成特别篇时，只改标题会丢掉这个信息
				if (entry.kind) {
					await episode.updateKind(entry.kind);
				}
			}
		}
		if (item.order?.length) {
			await season.rewriteEpisodeOrder(item.order);
		}
		result.seasons.push({
			seasonId: item.seasonId,
			title: titleChanged,
			order: item.order?.length ?? 0,
			episodes: item.episodes?.length ?? 0,
		});
	}

	// 季可能来自成员系列，保存要等整组落盘
	await Promise.all(group.map((item) => item.waitDataSave()));
	return result;
}
