/**
 * Bangumi v0 API 的响应结构。
 *
 * 只声明同步用到的字段；接口返回的其余字段保持忽略，避免上游加字段时被动维护。
 * 字段语义以 `.cache/bangumi-raw/` 的真实响应为准，不要凭文档猜。
 */

/** 条目摘要，搜索结果与条目详情共用一套结构 */
export interface BangumiSubjectSummary {
	id: number;
	/** 原名（通常是日文） */
	name: string;
	/** 中文名，可能为空串 */
	name_cn: string;
	/** 首播日期 YYYY-MM-DD，未定档时缺失 */
	date?: string;
	/** 本篇话数，不含 SP 与 PV */
	eps?: number;
	/** 1=书籍 2=动画 3=音乐 4=游戏 6=三次元 */
	type?: number;
	/** 平台，如 TV、剧场版、OVA；同人作品可能是「其他」 */
	platform?: string;
	/** 标签，类型整合的输入 */
	meta_tags?: string[];
	summary?: string;
}

/**
 * 剧集。
 *
 * 三字段的关系（已用真实数据核对，见 `docs/modules/server/bangumi-sync.md`）：
 * - `type`：0=本篇（含第 0 话）1=特别篇 2=OP 3=ED 4=PV/CM 5=MAD 6=其他；
 * - `sort`：播出顺序号，可跨条目连续，可为 0 或小数（18.5）；
 * - `ep`：条目内 1-based 序号，跨条目重复且 SP 恒为 0，**不可用于任何判断**。
 */
export interface BangumiEpisode {
	id: number;
	subject_id: number;
	type: number;
	sort: number;
	ep: number;
	name: string;
	name_cn: string;
	airdate: string;
	duration: string;
	duration_seconds?: number;
	disc?: number;
}

export const EPISODE_TYPE = {
	MAIN: 0,
	SPECIAL: 1,
	OP: 2,
	ED: 3,
	PV: 4,
	MAD: 5,
	OTHER: 6,
} as const;

export interface BangumiSearchResponse {
	data: BangumiSubjectSummary[];
	total: number;
	limit: number;
	offset: number;
}

export interface BangumiEpisodePage {
	data: BangumiEpisode[];
	total: number;
	limit: number;
	offset: number;
}
