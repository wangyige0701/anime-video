/**
 * 集类型：正片与特别篇。
 *
 * 落库字段，供详情页标注与同步写回使用。历史数据没有该字段时按 `main` 处理，
 * 因此读取侧必须容忍缺省，不能把 undefined 当成第三种类型。
 */
export type EpisodeKind = 'main' | 'special';

export const episodeKinds: Array<{ value: EpisodeKind; label: string }> = [
	{ value: 'main', label: '正片' },
	{ value: 'special', label: '特别篇' },
];

export function isEpisodeKind(value: unknown): value is EpisodeKind {
	return value === 'main' || value === 'special';
}
