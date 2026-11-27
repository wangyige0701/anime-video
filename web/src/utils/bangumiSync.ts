import type {
	BangumiApplyInput,
	BangumiMatchSeason,
	BangumiPreviewResult,
	BangumiPreviewSeason,
} from '@/@types/bangumi-sync';

/**
 * 一个季最多由三个 Bangumi 条目拼成（split cour），与服务端 `bangumiPreviewSchema` 的上限一致。
 */
export const MAX_SUBJECTS_PER_SEASON = 3;

/** 可勾选的系列字段 */
export interface BangumiSeriesSelection {
	title: boolean;
	description: boolean;
	date: boolean;
	status: boolean;
	types: boolean;
}

/**
 * 一个季的勾选状态：季标题、整体重排、以及逐集的标题。
 *
 * `order` 只能整体勾选：服务端要求排序数组是该季全部集的一个排列，
 * 部分勾选无法表达，因此它对应「按预览顺序重排」这一件事。
 */
export interface BangumiSeasonSelection {
	seasonId: string;
	title: boolean;
	order: boolean;
	episodes: Record<string, boolean>;
}

/** 预览页的勾选状态 */
export interface BangumiSelection {
	series: BangumiSeriesSelection;
	seasons: BangumiSeasonSelection[];
}

/** 本次提交将写入的条目数量，用于按钮文案与空提交拦截 */
export interface BangumiSelectionSummary {
	/** 系列字段数 */
	series: number;
	/** 涉及的季数 */
	seasons: number;
	/** 标题数：系列字段 + 季标题 */
	titles: number;
	/** 需要重排的季数 */
	orders: number;
	/** 集标题数 */
	episodes: number;
	total: number;
}

/**
 * 按 AI 建议的季顺序排列本地季。
 *
 * AI 未给出 `order` 时保留本地顺序；`sort` 必须稳定，否则同一份输入
 * 多次渲染会得到不同顺序，用户在确认页看到的季与提交的季就对不上了。
 */
export function orderSeasonsBySuggestion<T extends Pick<BangumiMatchSeason, 'order'>>(seasons: T[]): T[] {
	return seasons
		.map((season, index) => ({ season, index, key: season.order ?? index + 1 }))
		.sort((a, b) => a.key - b.key || a.index - b.index)
		.map((item) => item.season);
}

/**
 * 生成 `preview` 的入参。
 *
 * - 顺序按 AI 建议排列，服务端会再按条目首播日期决定季内顺序，这里不影响正片归属；
 * - 同一季里重复的条目要去掉，否则官方集序列会出现两遍；
 * - 没有选中任何条目的季直接传空数组，服务端会把它排除在预览之外（当作人工处理）。
 */
export function buildSeasonMapping(seasons: BangumiMatchSeason[]): Array<{ seasonId: string; subjectIds: number[] }> {
	return orderSeasonsBySuggestion(seasons).map((season) => ({
		seasonId: season.seasonId,
		subjectIds: [...new Set(season.subjectIds)],
	}));
}

/**
 * 从预览生成默认勾选状态。
 *
 * 默认只勾选「一定能写」的内容：空标题、空描述、无日期、无类型的字段都不勾，
 * 避免把 Bangumi 缺失的数据当成「清空本地数据」提交。
 */
export function createSelection(preview: BangumiPreviewResult): BangumiSelection {
	return {
		series: {
			title: !!preview.series.title.trim(),
			// 描述允许为空即清空，但默认不勾选，交给用户显式决定
			description: !!preview.series.description.trim(),
			date: !!preview.series.date,
			status: !!preview.series.status,
			types: preview.series.types.length > 0,
		},
		seasons: preview.seasons.map((season) => ({
			seasonId: season.seasonId,
			title: !!season.title.trim(),
			// 只有一集时重排没有意义，默认不勾选
			order: season.episodes.length > 1,
			episodes: Object.fromEntries(season.episodes.map((episode) => [episode.episodeId, !!episode.title.trim()])),
		})),
	};
}

/**
 * 把勾选状态转成 `apply` 入参。
 *
 * 未勾选的字段不出现在结果里——服务端把「字段缺省」当作不修改，
 * 因此这里不能传 `undefined` 之外的占位值，也不能用空数组表达「没选」。
 */
export function buildApplyInput(preview: BangumiPreviewResult, selection: BangumiSelection): BangumiApplyInput {
	const input: BangumiApplyInput = {};
	const series = selection.series;

	if (series.title && preview.series.title.trim()) {
		input.series = { ...input.series, title: preview.series.title.trim() };
	}
	if (series.description) {
		input.series = { ...input.series, description: preview.series.description.trim() };
	}
	if (series.date && preview.series.date) {
		const [year, month] = preview.series.date;
		input.series = { ...input.series, date: { year, month } };
	}
	if (series.status && preview.series.status) {
		input.series = { ...input.series, status: preview.series.status };
	}
	if (series.types && preview.series.types.length) {
		input.series = { ...input.series, types: [...preview.series.types] };
	}

	const seasons: NonNullable<BangumiApplyInput['seasons']> = [];
	for (const season of preview.seasons) {
		const picked = selection.seasons.find((item) => item.seasonId === season.seasonId);
		if (!picked) {
			continue;
		}
		const item: NonNullable<BangumiApplyInput['seasons']>[number] = { seasonId: season.seasonId };
		if (picked.title && season.title.trim()) {
			item.title = season.title.trim();
		}
		// 顺序始终是该季全部集的排列，不能只提交被勾选的集
		const order = season.episodes.map((episode) => episode.episodeId);
		if (picked.order && order.length) {
			item.order = order;
		}
		const episodes = season.episodes
			.filter((episode) => picked.episodes[episode.episodeId] && episode.title.trim())
			.map((episode) => ({ episodeId: episode.episodeId, title: episode.title.trim() }));
		if (episodes.length) {
			item.episodes = episodes;
		}
		// 三项都没有内容时跳过，避免无意义的写请求
		if (item.title === undefined && item.order === undefined && item.episodes === undefined) {
			continue;
		}
		seasons.push(item);
	}
	if (seasons.length) {
		input.seasons = seasons;
	}
	return input;
}

/** 统计本次提交的写入数量，`total` 为 0 时不应发起请求 */
export function summarizeSelection(input: BangumiApplyInput): BangumiSelectionSummary {
	const seasons = input.seasons ?? [];
	const series = input.series ? Object.keys(input.series).length : 0;
	const seasonTitles = seasons.filter((season) => season.title).length;
	const orders = seasons.filter((season) => season.order).length;
	const episodes = seasons.reduce((total, season) => total + (season.episodes?.length ?? 0), 0);
	const titles = series + seasonTitles;
	return { series, seasons: seasons.length, titles, orders, episodes, total: titles + orders + episodes };
}

/**
 * 季对齐方式的文案。
 *
 * `partial` 表示规则与模型都没能全部归位，此时预览里的标题有一部分是文件名，
 * 需要在 UI 上明确提示，否则用户会以为整季都同步成功了。
 */
export function describeAlignment(alignment: BangumiPreviewSeason['alignment']) {
	if (alignment === 'rule') {
		return '按集号自动对齐';
	}
	if (alignment === 'ai') {
		return '由模型对齐';
	}
	return '部分对齐';
}
