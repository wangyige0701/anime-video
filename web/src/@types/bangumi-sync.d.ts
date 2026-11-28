/**
 * Bangumi 同步接口的响应结构。
 *
 * 与服务端 `server/src/integrations/bangumi/sync.ts` 的导出类型一一对应，
 * 前端只消费这些结果，不重复定义推断规则。
 */

/** 搜索命中的 Bangumi 条目 */
export interface BangumiCandidate {
	id: number;
	name: string;
	nameCn: string;
	date?: string;
	eps?: number;
}

/** 单个本地季的匹配建议 */
export interface BangumiMatchSeason {
	seasonId: string;
	/** 相对系列目录的路径，用于在 UI 上区分多个季 */
	path: string;
	fileCount: number;
	specialCount: number;
	sampleFiles: string[];
	/** AI 建议的季顺序，未给出时为空 */
	order?: number;
	subjectIds: number[];
}

export interface BangumiMatchResult {
	seriesId: string;
	seriesName: string;
	seasons: BangumiMatchSeason[];
	candidates: BangumiCandidate[];
	notes: string;
	warnings: string[];
}

/** 预览里的一集：`position` 是落库位置，`officialSort` 仅用于核对 */
export interface BangumiPreviewEpisode {
	episodeId: string;
	fileName: string;
	position: number;
	officialSort: number | null;
	kind: 'main' | 'special' | 'unmatched';
	title: string;
	officialTitle: string;
	/** 合并集覆盖的集数，0 表示普通文件 */
	coveredCount: number;
	/** 合并集覆盖的各集标题，按播出顺序；普通文件为空数组 */
	coveredTitles: string[];
}

export interface BangumiPreviewSeason {
	seasonId: string;
	path: string;
	fromTitle: string;
	title: string;
	alignment: 'rule' | 'ai' | 'partial';
	episodes: BangumiPreviewEpisode[];
	missing: Array<{ kind: 'main' | 'special'; sort: number; title: string }>;
	notes: string[];
	warnings: string[];
}

export interface BangumiPreviewSeries {
	title: string;
	description: string;
	date: [number, number] | null;
	status: number;
	types: number[];
	typesMatched: string[];
	typesUnmatched: string[];
}

export interface BangumiPreviewResult {
	seriesId: string;
	series: BangumiPreviewSeries;
	seasons: BangumiPreviewSeason[];
	warnings: string[];
}

/** 提交时的结构，字段缺省表示不修改 */
export interface BangumiApplyInput {
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
		episodes?: Array<{
			episodeId: string;
			title: string;
			/** 缺省表示不改集类型；未匹配到官方剧集的集不带该字段 */
			kind?: 'main' | 'special';
		}>;
	}>;
}

export interface BangumiApplyResult {
	series: string[];
	seasons: Array<{ seasonId: string; title: boolean; order: number; episodes: number }>;
}
