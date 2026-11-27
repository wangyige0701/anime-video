/**
 * 系列合并关系的规范化。
 *
 * 合并关系只保存在主系列上（`mergedIds`），因此不合法的数据只可能来自两种途径：
 * 手工编辑数据文件，或磁盘上的系列被删除后留下的悬空 id。规范化必须保证三条不变式：
 *
 * 1. 成员必须存在、不能是自己、同一列表内不重复；
 * 2. 一个系列最多属于一个主系列（先到先得，保持 Map 迭代顺序的确定性）；
 * 3. 不允许链式合并：被合并的系列不能再持有成员，它的成员要展平并转移给新的主系列。
 *
 * 第 3 条同时让互相指向的环（A 持有 B、B 持有 A）自然消解为「各自独立」，
 * 不需要单独的成环检测。
 */

/** 原始合并关系：系列 id → 该系列持有的成员 id 数组 */
export type MergeGroups = Map<string, string[]>;

function sanitize(members: string[], selfId: string, known: Set<string>) {
	const result: string[] = [];
	for (const member of members) {
		if (!member || member === selfId || !known.has(member) || result.includes(member)) {
			continue;
		}
		result.push(member);
	}
	return result;
}

/** 按当前列表建立归属：同一成员被多个主系列声明时保留先出现的一个 */
function buildOwners(groups: MergeGroups) {
	const owners = new Map<string, string>();
	for (const [mainId, members] of groups) {
		for (const member of members) {
			if (member !== mainId && !owners.has(member)) {
				owners.set(member, mainId);
			}
		}
	}
	return owners;
}

/**
 * 规范化合并关系，返回新 Map，不修改入参。
 *
 * 返回值与入参的键集合一致（每个系列都有一项），便于调用方逐项比对是否需要写盘。
 */
export function normalizeMergeGroups(groups: MergeGroups): MergeGroups {
	const known = new Set(groups.keys());
	const resolved: MergeGroups = new Map();
	for (const [id, members] of groups) {
		resolved.set(id, sanitize(members, id, known));
	}

	// 展平链式合并。每次展平都可能让新的成员关系出现归属变化，
	// 因此循环到不再变化为止；轮数上限取系列数量，足以覆盖任意长的链。
	for (let round = 0; round <= resolved.size; round++) {
		const owners = buildOwners(resolved);
		let changed = false;
		for (const [id, members] of resolved) {
			const owner = owners.get(id);
			if (!owner) {
				continue;
			}
			const target = resolved.get(owner);
			if (!target) {
				continue;
			}
			for (const member of members) {
				if (member !== owner && !target.includes(member)) {
					target.push(member);
				}
			}
			if (members.length) {
				resolved.set(id, []);
				changed = true;
			}
		}
		if (!changed) {
			break;
		}
	}

	// 展平后可能出现多个主系列持有同一成员，按最终归属只保留在所属主系列上。
	const owners = buildOwners(resolved);
	for (const [mainId, members] of resolved) {
		resolved.set(
			mainId,
			members.filter((member) => owners.get(member) === mainId),
		);
	}
	return resolved;
}
