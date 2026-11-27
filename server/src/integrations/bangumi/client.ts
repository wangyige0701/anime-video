/**
 * Bangumi v0 API 客户端。
 *
 * 只读接口，不需要 token；但 Bangumi 会拒绝没有自定义 User-Agent 的请求，
 * 所以 UA 必须来自配置而不是 Node 默认值。
 */
import { ApiError } from '~server/src/error';
import { getBangumiConfig } from './config';
import { requestJsonWithRetry } from '../http';
import type { BangumiEpisodePage, BangumiSearchResponse, BangumiSubjectSummary } from './types';

/** 动画条目在 Bangumi 里的 type 值 */
const SUBJECT_TYPE_ANIME = 2;

/**
 * 上游失败的统一错误。
 *
 * `ApiError` 第二个参数是响应体、第三个才是 `Error.message`，两处都传同一句，
 * 前端能拿到原因，日志也有可读消息。
 */
function upstreamError(message: string) {
	return new ApiError(502, message, message);
}

function endpoint(path: string) {
	const config = getBangumiConfig();
	return { url: `${config.baseUrl.replace(/\/+$/, '')}${path}`, config };
}

function headers() {
	return { 'User-Agent': getBangumiConfig().userAgent };
}

/**
 * 搜索动画条目。
 *
 * 同时用中文名和日文名各搜一次由调用方决定；这里只负责单次查询。
 * 搜索失败不抛错而是返回空数组：匹配阶段还有候选可试，整体失败由调用方判断。
 */
export async function searchSubjects(keyword: string, limit = 20): Promise<BangumiSubjectSummary[]> {
	const config = getBangumiConfig();
	const { url } = endpoint('/v0/search/subjects');
	const response = await requestJsonWithRetry<BangumiSearchResponse>(url, {
		method: 'POST',
		headers: headers(),
		timeout: config.timeout,
		proxy: config.proxy,
		// type 限定为动画，避免同名书籍、音乐混进候选
		body: { keyword, filter: { type: [SUBJECT_TYPE_ANIME] } },
	});
	if (response.status !== 200 || !response.data) {
		return [];
	}
	return (response.data.data ?? []).slice(0, limit);
}

/** 取条目详情；不存在时返回 null，由调用方决定是跳过还是报错 */
export async function getSubject(subjectId: number): Promise<BangumiSubjectSummary | null> {
	const config = getBangumiConfig();
	const { url } = endpoint(`/v0/subjects/${subjectId}`);
	const response = await requestJsonWithRetry<BangumiSubjectSummary>(url, {
		headers: headers(),
		timeout: config.timeout,
		proxy: config.proxy,
	});
	if (response.status === 404) {
		return null;
	}
	if (response.status !== 200 || !response.data) {
		throw upstreamError(`Bangumi 条目 ${subjectId} 读取失败（HTTP ${response.status}）`);
	}
	return response.data;
}

/**
 * 取条目的全部剧集。
 *
 * 单页上限 200 已覆盖常见季番；仍按返回的 total 判断是否翻页，
 * 避免长篇条目被截断后静默产出错误的集映射。
 */
export async function getSubjectEpisodes(subjectId: number): Promise<BangumiEpisodePage['data']> {
	const config = getBangumiConfig();
	const episodes: BangumiEpisodePage['data'] = [];
	let offset = 0;
	for (;;) {
		const { url } = endpoint(`/v0/episodes?subject_id=${subjectId}&limit=200&offset=${offset}`);
		const response = await requestJsonWithRetry<BangumiEpisodePage>(url, {
			headers: headers(),
			timeout: config.timeout,
			proxy: config.proxy,
		});
		if (response.status !== 200 || !response.data) {
			throw upstreamError(`Bangumi 条目 ${subjectId} 剧集读取失败（HTTP ${response.status}）`);
		}
		const page = response.data.data ?? [];
		episodes.push(...page);
		offset += page.length;
		if (!page.length || offset >= (response.data.total ?? 0)) {
			break;
		}
	}
	return episodes;
}
