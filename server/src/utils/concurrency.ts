/**
 * 以固定并发上限执行异步任务。
 *
 * 用于磁盘扫描这类「任务多、单个任务都是 IO 等待」的场景：
 * 全串行会把总耗时累加成任务数 × 单次延迟，全并发又可能一次打开过多文件句柄。
 *
 * 结果顺序与入参顺序一致，便于调用方继续按目录顺序输出。
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const size = Math.floor(limit);
	if (!Number.isFinite(size) || size < 1) {
		throw new Error('并发上限必须是大于 0 的整数');
	}
	if (items.length === 0) {
		return [];
	}

	const results = new Array<R>(items.length);
	let cursor = 0;

	/** 单个工作协程：不断领取下一个下标直到取完 */
	async function run() {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await worker(items[index]!, index);
		}
	}

	// 并发数不超过任务数，避免创建空转协程
	const workers = Array.from({ length: Math.min(size, items.length) }, () => run());
	await Promise.all(workers);
	return results;
}
