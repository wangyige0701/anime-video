/**
 * 显式顺序与默认顺序的合并规则。
 *
 * 合并组的季和图片都有两份顺序来源：
 *
 * - 主系列记录的**显式顺序**（`mergedSeasonOrder` / `mergedImageOrder`），用户拖拽产生；
 * - 各系列自己的**默认顺序**（季按 `sort`、图片按 `sort`），由扫描与单系列排序维护。
 *
 * 服务端落库与前端渲染必须用同一套规则合成最终顺序，否则「拖完是 A 顺序、刷新变 B 顺序」。
 * 规则本身没有领域知识，只依赖调用方给出的键，因此可以放在共享目录供两端复用。
 */

/**
 * 按显式顺序重排池子里的条目。
 *
 * 三条不变式：
 *
 * 1. **显式顺序优先**：按 `order` 逐项挑选，找不到的键（已删除、已脱离合并）直接跳过；
 * 2. **不丢数据**：没被显式顺序覆盖的条目保持 `pool` 的原始相对顺序追加在末尾，
 *    新增的季或图片因此会自然落到最后，不需要额外迁移；
 * 3. **不修改入参**：返回新数组，`pool` 与 `order` 都保持原样。
 *
 * 重复键只认第一次出现：`pool` 里同键的后续项被丢弃，`order` 里重复的键被忽略。
 *
 * @param pool 默认顺序下的全部条目
 * @param order 显式顺序，元素为 `getKey()` 的返回值
 * @param getKey 取条目唯一键
 */
export function applyExplicitOrder<T>(pool: T[], order: string[], getKey: (item: T) => string): T[] {
	const byKey = new Map<string, T>();
	for (const item of pool) {
		const key = getKey(item);
		if (!byKey.has(key)) {
			byKey.set(key, item);
		}
	}

	const result: T[] = [];
	const used = new Set<string>();
	for (const key of order) {
		const item = byKey.get(key);
		if (!item || used.has(key)) {
			continue;
		}
		used.add(key);
		result.push(item);
	}
	for (const item of pool) {
		const key = getKey(item);
		if (!used.has(key)) {
			used.add(key);
			result.push(item);
		}
	}
	return result;
}
