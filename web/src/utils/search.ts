import { WebRoute } from '~shared/web-route-config';

/**
 * 搜索导航计划。
 *
 * - `search`：进入/更新搜索结果页，`replace` 决定是否替换当前历史记录；
 * - `index`：关键词被清空且当前就在搜索页，退回首页；
 * - `null`：什么都不用做（关键词为空且不在搜索页）。
 */
export type SearchNavigation = { kind: 'search'; keyword: string; replace: boolean } | { kind: 'index'; replace: true };

/**
 * 根据当前路由与输入框内容决定如何跳转。
 *
 * 规则来自两个约束：
 * - 在搜索页连续输入时用 `replace`，否则每敲一个字都会新增一条历史记录；
 * - 从其它页面进入搜索用 `push`，这样返回时能回到进入搜索前的页面。
 *
 * 纯函数，便于单测覆盖「空关键词」「已在搜索页」「关键词含首尾空格」等分支。
 */
export function planSearchNavigation(currentName: string | undefined, keyword: string): SearchNavigation | null {
	const target = keyword.trim();
	const onSearchPage = currentName === WebRoute.SEARCH;
	if (!target) {
		return onSearchPage ? { kind: 'index', replace: true } : null;
	}
	return { kind: 'search', keyword: target, replace: onSearchPage };
}
