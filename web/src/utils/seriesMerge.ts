/**
 * 系列合并的纯逻辑。
 *
 * 与 `seriesQuery.ts` 一样不依赖 Vue 响应式与领域对象方法，既方便单测，
 * 也让「谁被隐藏、叠层显示什么、能不能合并」这些规则只存在一处。
 */

/**
 * 参与合并计算的最小字段集合。
 *
 * `Series` 领域对象在结构上满足该接口，测试可直接传入普通对象。
 */
export interface MergeableSeries {
	id: string;
	title: string;
	images: string[];
	/** 主系列持有的成员 id；缺省视为空数组，兼容尚未升级的调用方 */
	mergedIds?: string[];
}

/** 叠层最多显示的层数；超出部分只在角标里体现数字，不限制实际合并数量 */
export const MERGE_STACK_LIMIT = 3;

/**
 * 建立「成员 id → 主系列 id」索引。
 *
 * 合并关系只记录在主系列上，因此任何反向查询都要先建索引。
 * 同一成员被多个主系列声明时保留先出现的一个，与服务端规范化规则一致。
 */
export function buildMergeOwnerIndex<T extends MergeableSeries>(list: T[]) {
	const owners = new Map<string, string>();
	for (const series of list) {
		for (const memberId of series.mergedIds ?? []) {
			if (memberId !== series.id && !owners.has(memberId)) {
				owners.set(memberId, series.id);
			}
		}
	}
	return owners;
}

/**
 * 过滤掉已被合并的系列。
 *
 * 被合并系列不再作为独立条目出现在首页与搜索结果里，它的内容通过主系列的详情页呈现。
 * 必须在分页之前执行，否则每页会空出被过滤掉的坑位。
 */
export function excludeMergedMembers<T extends MergeableSeries>(list: T[]) {
	const owners = buildMergeOwnerIndex(list);
	return list.filter((series) => !owners.has(series.id));
}

/**
 * 按主系列记录的顺序取出成员对象。
 *
 * 找不到的 id 直接跳过：磁盘上的成员可能已被删除，服务端规范化会在下次扫描时清理，
 * 这里不能因为一条悬空引用就让整块列表渲染失败。
 */
export function getGroupMembers<T extends MergeableSeries>(main: T, byId: Map<string, T>) {
	const members: T[] = [];
	for (const id of main.mergedIds ?? []) {
		const member = byId.get(id);
		if (member && member.id !== main.id) {
			members.push(member);
		}
	}
	return members;
}

/**
 * 计算卡片背后的叠层：每层显示一个成员系列的首图。
 *
 * @returns `images` 为最多 `limit` 张首图（由近到远），`overflow` 为未显示的成员数量
 */
export function getMergeStack(members: MergeableSeries[], limit = MERGE_STACK_LIMIT) {
	const safeLimit = Math.max(0, Math.floor(limit));
	const shown = members.slice(0, safeLimit);
	return {
		images: shown.map((member) => member.images[0] ?? ''),
		overflow: Math.max(0, members.length - shown.length),
	};
}

/**
 * 判断能否把 `sourceId` 合并到 `targetId`。
 *
 * @returns 拒绝原因；合法时返回 `null`
 */
export function getMergeRejection(sourceId: string, targetId: string, owners: Map<string, string>) {
	if (sourceId === targetId) {
		return '不能合并到自身';
	}
	if (owners.get(targetId) === sourceId) {
		return '该系列已在合并组中';
	}
	if (owners.has(targetId)) {
		return '该系列已被合并，不能作为主系列';
	}
	if (owners.has(sourceId)) {
		return '该系列已被合并，请先脱离';
	}
	return null;
}
