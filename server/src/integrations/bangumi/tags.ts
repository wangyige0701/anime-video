/**
 * Bangumi 标签到项目系列类型的映射。
 *
 * 分两步：先做精确匹配（`日本`、`TV`、`小说改` 这类两边同名），再把剩下的交给模型。
 * 真实数据里六成以上的标签能精确命中，全部走模型既慢又容易把「StudioBind」这类
 * 制作公司名硬塞成类型。
 */
import type { ChatMessage } from '../ai/client';

export interface SeriesTypeOption {
	id: number;
	name: string;
}

export interface TagRuleResult {
	/** 规则命中的类型 id，去重后按传入类型表顺序 */
	types: number[];
	/** 未能精确命中的标签，交给模型判断 */
	unmatched: string[];
}

function normalize(name: string) {
	return name.replace(/\s+/g, '').toLowerCase();
}

/** 标签与类型名完全相同才算命中；不做同义词推断，避免「异世界 → 奇幻」这类误判落到规则层 */
export function matchTagsByRules(tags: string[], types: SeriesTypeOption[]): TagRuleResult {
	const byName = new Map(types.map((type) => [normalize(type.name), type.id]));
	const matched = new Set<number>();
	const unmatched: string[] = [];
	for (const tag of tags) {
		const id = byName.get(normalize(tag));
		if (id === undefined) {
			unmatched.push(tag);
			continue;
		}
		matched.add(id);
	}
	return {
		types: types.filter((type) => matched.has(type.id)).map((type) => type.id),
		unmatched,
	};
}

export const TAG_SYSTEM = `你是动画标签归类助手。把 Bangumi 的标签映射到给定类型列表中已有的类型。

输入：
- tags：待判断的标签
- types：项目支持的类型 [id, 名称]

规则：
1. 只能从 types 里选择 id，不要编造。
2. 语义等价或包含关系才映射：例如「异世界」可以映射到「奇幻」，「轻小说改」可以映射到「轻改」，「TV动画」可以映射到「TV」。
3. 制作公司、年份季度、声优、评分、播放平台代号这类不是类型，直接忽略。
4. 一个标签最多映射到一个 id；多个标签可以映射到同一个 id。
5. 没有把握就不映射，不要为了凑数硬塞。

只输出 JSON，不要解释、不要代码块：{"map":[{"tag":"异世界","id":6}],"ignored":["StudioBind"]}`;

export function buildTagMessages(tags: string[], types: SeriesTypeOption[]): ChatMessage[] {
	const payload = {
		tags,
		types: types.map((type) => [type.id, type.name]),
	};
	return [
		{ role: 'system', content: TAG_SYSTEM },
		{ role: 'user', content: `${JSON.stringify(payload)}\n只输出 {"map":[...],"ignored":[...]}` },
	];
}

export interface TagAiResult {
	types: number[];
	ignored: string[];
	warnings: string[];
}

/**
 * 校验模型输出。
 *
 * 只接受类型表里存在的 id，并按输入类型的顺序返回，保证落库顺序稳定 ——
 * 否则同一部作品两次同步可能得到不同的 `types` 数组顺序。
 */
export function parseTagResult(content: unknown, types: SeriesTypeOption[], knownTags: string[]): TagAiResult {
	const warnings: string[] = [];
	const allowed = new Set(types.map((type) => type.id));
	const known = new Set(knownTags);
	const matched = new Set<number>();
	const ignored: string[] = [];
	const list = Array.isArray((content as { map?: unknown })?.map)
		? ((content as { map: unknown[] }).map as Array<Record<string, unknown>>)
		: [];
	for (const item of list) {
		const tag = typeof item?.tag === 'string' ? item.tag : '';
		const id = typeof item?.id === 'number' ? item.id : Number.NaN;
		if (!known.has(tag)) {
			warnings.push(`AI 返回了未提供的标签：${tag || '(空)'}`);
			continue;
		}
		if (!Number.isInteger(id) || !allowed.has(id)) {
			warnings.push(`标签「${tag}」映射到无效类型 ${String(item?.id)}`);
			continue;
		}
		matched.add(id);
	}
	const rawIgnored = Array.isArray((content as { ignored?: unknown })?.ignored)
		? ((content as { ignored: unknown[] }).ignored as unknown[])
		: [];
	for (const value of rawIgnored) {
		if (typeof value === 'string' && known.has(value)) {
			ignored.push(value);
		}
	}
	return {
		types: types.filter((type) => matched.has(type.id)).map((type) => type.id),
		ignored,
		warnings,
	};
}
