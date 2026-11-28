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

/**
 * 对比用的本地数据快照。
 *
 * 只取会被同步覆盖的字段：勾选状态要据此把「与当前完全一致」的项排除掉，
 * 否则用户会把大量没有变化的条目一起提交，既浪费写请求也让 diff 难以阅读。
 */
export interface BangumiCurrentSnapshot {
	series: {
		title: string;
		description: string;
		date?: Array<number | undefined> | null;
		status: number;
		types: number[];
	};
	seasons: Array<{
		seasonId: string;
		/** 当前展示顺序的 episodeId，用于判断「重排」是否真的会改变顺序 */
		episodeIds: string[];
		/** episodeId → 当前标题 */
		episodeTitles: Record<string, string>;
	}>;
}

/**
 * 逐项对比结果：`true` 表示与当前数据一致，不需要更新。
 *
 * 命名统一为「相同」而不是「有变化」，调用方在 UI 上禁用勾选时不用再取反。
 * 预览缺字段时一律判为不同，交给 `createSelection` 的缺失规则处理，
 * 两条规则叠加后都不会被勾选。
 */
export interface BangumiPreviewDiff {
	series: Record<keyof BangumiSeriesSelection, boolean>;
	seasons: Array<{ title: boolean; order: boolean; episodes: Record<string, boolean> }>;
}

/**
 * 构造快照所需的最小结构。
 *
 * 取结构化字段而不是 `Series` 类：对话框挂在独立的应用里，拿不到详情页的 provide，
 * 只能把当前值当普通数据传进去；测试也可以直接用普通对象。
 */
export interface BangumiSnapshotSource {
	title: string;
	description: string;
	date?: Array<number | undefined> | null;
	status: number;
	types: number[];
	seasons: Array<{
		id: string;
		episodes: Array<{ id: string; title: string }>;
	}>;
}

/**
 * 把详情页的系列对象压成对比用的快照。
 *
 * 只保留会被同步覆盖的字段：字段越多，快照与真实数据不一致的机会越大，
 * 而对比只看这几个字段。季内顺序按当前展示顺序记录，重排判断依赖它。
 *
 * `extraSeasons` 传被合并系列的季：详情页把它们与主系列拼在一起展示，
 * 同步也覆盖同一范围，快照漏掉它们会让成员的季永远判成「有变化」。
 */
export function buildCurrentSnapshot(
	series: BangumiSnapshotSource,
	extraSeasons: BangumiSnapshotSource['seasons'] = [],
): BangumiCurrentSnapshot {
	const seasons = [...series.seasons, ...extraSeasons];
	return {
		series: {
			title: series.title,
			description: series.description,
			date: series.date,
			status: series.status,
			types: [...series.types],
		},
		seasons: seasons.map((season) => ({
			seasonId: season.id,
			episodeIds: season.episodes.map((episode) => episode.id),
			episodeTitles: Object.fromEntries(season.episodes.map((episode) => [episode.id, episode.title])),
		})),
	};
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
 * 传入对比结果后，与当前数据完全一致的项同样不勾——它们提交也只会写回同样的值。
 */
export function createSelection(preview: BangumiPreviewResult, diff?: BangumiPreviewDiff): BangumiSelection {
	const same = diff?.series;
	return {
		series: {
			title: !same?.title && !!preview.series.title.trim(),
			// 描述允许为空即清空，但默认不勾选，交给用户显式决定
			description: !same?.description && !!preview.series.description.trim(),
			date: !same?.date && !!preview.series.date,
			status: !same?.status && !!preview.series.status,
			types: !same?.types && preview.series.types.length > 0,
		},
		seasons: preview.seasons.map((season, index) => {
			const sameSeason = diff?.seasons[index];
			return {
				seasonId: season.seasonId,
				title: !sameSeason?.title && !!season.title.trim(),
				// 只有一集时重排没有意义，默认不勾选
				order: !sameSeason?.order && season.episodes.length > 1,
				episodes: Object.fromEntries(
					season.episodes.map((episode) => [
						episode.episodeId,
						!sameSeason?.episodes[episode.episodeId] && !!episode.title.trim(),
					]),
				),
			};
		}),
	};
}

/**
 * 逐项对比预览与本地数据。
 *
 * 文本会先归一化空白再比较：「`标题！ `」与「`标题！`」在落库语义上完全一致，
 * 把它们当成变更只会制造无意义的写请求。
 */
export function diffPreview(preview: BangumiPreviewResult, current: BangumiCurrentSnapshot): BangumiPreviewDiff {
	return {
		series: {
			title: sameText(preview.series.title, current.series.title),
			description: sameText(preview.series.description, current.series.description),
			date: sameDate(preview.series.date, current.series.date),
			// 预览的 status 为 0 表示没解析出来，不算「相同」，也不该被勾选
			status: preview.series.status > 0 && preview.series.status === current.series.status,
			types: preview.series.types.length > 0 && sameNumberSet(preview.series.types, current.series.types),
		},
		seasons: preview.seasons.map((season) => {
			const local = current.seasons.find((item) => item.seasonId === season.seasonId);
			return {
				// 季标题用服务端给的 `fromTitle` 对比：它就是本地标题，
				// 不依赖前端缓存里的季对象是否与预览同源
				title: !!season.title.trim() && sameText(season.title, season.fromTitle),
				order:
					!!local &&
					season.episodes.length > 1 &&
					sameOrder(
						season.episodes.map((episode) => episode.episodeId),
						local.episodeIds,
					),
				episodes: Object.fromEntries(
					season.episodes.map((episode) => [
						episode.episodeId,
						!!episode.title.trim() &&
							sameText(episode.title, local?.episodeTitles[episode.episodeId] ?? ''),
					]),
				),
			};
		}),
	};
}

/** 折叠连续空白，避免仅差空格的内容被当成变更 */
function normalizeText(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function sameText(a: string, b: string) {
	return normalizeText(a) === normalizeText(b);
}

/** 类型是无序集合，顺序不同不算变更 */
function sameNumberSet(a: number[], b: number[]) {
	if (a.length !== b.length) {
		return false;
	}
	const sortedA = [...a].sort((x, y) => x - y);
	const sortedB = [...b].sort((x, y) => x - y);
	return sortedA.every((value, index) => value === sortedB[index]);
}

function sameDate(a: [number, number] | null, b?: Array<number | undefined> | null) {
	if (!a?.[0] || !a[1]) {
		return false;
	}
	return a[0] === b?.[0] && a[1] === b?.[1];
}

/** 顺序必须逐位相等：只要有一集挪了位置，重排就有意义 */
function sameOrder(a: string[], b: string[]) {
	return a.length === b.length && a.every((id, index) => id === b[index]);
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
			.map((episode) => ({
				episodeId: episode.episodeId,
				title: episode.title.trim(),
				// 未匹配到官方剧集的集没有分类可言，只写标题
				...(episode.kind === 'unmatched'
					? {}
					: { kind: episode.kind === 'special' ? ('special' as const) : ('main' as const) }),
			}));
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
 * 页脚汇总文案。
 *
 * 「将写入 14 项」只给总数，用户没法确认勾中的是标题还是重排；这里拆成四类分别计数。
 * 一类都没勾时给出明确说明，避免按钮禁用却不知道为什么。
 */
export function describeSelectionSummary(summary: BangumiSelectionSummary) {
	// `titles` 含系列字段，季标题要用差值才算得出来
	const seasonTitles = summary.titles - summary.series;
	const parts = [
		summary.series ? `系列字段 ${summary.series}` : '',
		seasonTitles ? `季标题 ${seasonTitles}` : '',
		summary.episodes ? `集标题 ${summary.episodes}` : '',
		summary.orders ? `重排 ${summary.orders} 季` : '',
	].filter(Boolean);
	return parts.length ? `将写入 ${summary.total} 项：${parts.join(' · ')}` : '未勾选任何变更';
}

/** 页脚按钮的标识，宿主与内容组件按它绑定行为 */
export type BangumiFooterKey = 'cancel' | 'start' | 'rematch' | 'back' | 'preview' | 'apply';

/** 页脚按钮的展示状态，点击行为由调用方按 `key` 绑定 */
export interface BangumiFooterButton {
	key: BangumiFooterKey;
	content: string;
	type?: 'primary';
	loading: boolean;
	disabled: boolean;
}

/** 决定页脚按钮的状态 */
export interface BangumiFooterState {
	/** 是否已经手动开始同步；为 `false` 时停在说明页，还不会检索 Bangumi */
	started: boolean;
	/** 0 = 匹配季与条目，1 = 确认变更 */
	step: number;
	matching: boolean;
	previewing: boolean;
	applying: boolean;
	/** 已选出 Bangumi 条目的季数，为 0 时无法生成预览 */
	mappedCount: number;
	/** 已勾选的写入项数，为 0 时不能提交 */
	total: number;
}

/**
 * 按当前步骤算出页脚按钮。
 *
 * 两步的按钮集合完全不同（第二步没有「重新匹配」，第一步没有「上一步」），
 * 因此整组返回而不是逐个显隐；任何一步请求进行中都禁用「取消」，
 * 否则响应会写回一个已经关闭的对话框。
 *
 * **未开始时只给「取消 / 开始同步」**：检索要调 Bangumi、还可能调模型，
 * 不能因为点开面板就自动发生，必须由用户明确确认一次。
 */
export function describeSyncFooter(state: BangumiFooterState): BangumiFooterButton[] {
	if (!state.started) {
		return [
			{ key: 'cancel', content: '取消', loading: false, disabled: false },
			{ key: 'start', content: '开始同步', type: 'primary', loading: state.matching, disabled: state.matching },
		];
	}
	const busy = state.matching || state.previewing || state.applying;
	if (state.step === 0) {
		return [
			{ key: 'cancel', content: '取消', loading: false, disabled: busy },
			{ key: 'rematch', content: '重新匹配', loading: state.matching, disabled: state.previewing },
			{
				key: 'preview',
				content: '生成预览',
				type: 'primary',
				loading: state.previewing,
				disabled: !state.mappedCount,
			},
		];
	}
	return [
		{ key: 'cancel', content: '取消', loading: false, disabled: busy },
		{ key: 'back', content: '上一步', loading: false, disabled: busy },
		{
			key: 'apply',
			content: `应用 ${state.total} 项`,
			type: 'primary',
			loading: state.applying,
			disabled: !state.total,
		},
	];
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
