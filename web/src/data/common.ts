import { isUndefined } from '@wang-yige/utils';
import type { Fn } from '@wang-yige/utils';
import { customRef, ref } from 'vue';

type RefCache<T> = { ref: Ref<T[]>; update: Fn<[T[]]>; track: Fn<[]> } | undefined;

/** 把 DTO 的每个字段映射为独立 Ref，供通用更新逻辑按键访问 */
export type FieldRefs<T extends object> = { [K in keyof T]-?: Ref<T[K]> };

/** 字段级请求状态控制器：读取时建立响应式依赖，返回普通布尔值 */
export type StatusController = {
	get: (key: string) => boolean;
	run: <R>(key: string, task: () => Promise<R>) => Promise<R>;
};

/**
 * 乐观更新一个字段：先写本地值并打开字段状态，失败回滚，结束后关闭状态。
 *
 * 与原先每个字段手写 `onX() -> try/catch -> offX()` 的行为一致，
 * 返回请求是否成功，供排序等需要分支处理的调用方使用。
 *
 * 回滚只在本地值仍是本次乐观值时才执行：同一字段的请求使用 `Single.PREV` 时会取消
 * 前一次请求，若前一次失败无条件回滚，会把后一次已经写入的新值覆盖成更旧的值。
 *
 * @param settle 请求成功后用返回值纠正本地值；返回 `undefined` 表示不调整。
 * 标题用它同步服务端还原出的默认标题（空标题提交后本地不能停在空串）。
 */
export async function patchField<T extends object, K extends keyof T>(
	values: FieldRefs<T>,
	status: StatusController,
	key: K,
	next: T[K],
	commit: () => Promise<unknown>,
	settle?: (result: unknown) => unknown,
): Promise<boolean> {
	const target = values[key];
	const oldValue = target.value;
	target.value = next;
	// 数组/对象字段经 ref 读取得到的是响应式代理，不能直接与传入值比引用，
	// 这里以「写入后立刻读回的值」作为本次乐观更新的标记。
	const optimistic = target.value;
	try {
		const result = await status.run(key as string, commit);
		const settled = settle?.(result);
		// 请求期间又发生了新的编辑时，不能再用旧响应覆盖当前值。
		if (!isUndefined(settled) && target.value === optimistic) {
			target.value = settled as T[K];
		}
		return true;
	} catch {
		if (target.value === optimistic) {
			target.value = oldValue;
		}
		return false;
	}
}

/**
 * 标题以服务端返回值为准。
 *
 * 服务端会把空标题还原为默认标题（系列目录名、季目录名、文件名去扩展名），
 * 直接用返回值覆盖本地乐观更新的空串，避免界面停在空白标题上。
 */
export function serverTitle(result: unknown) {
	return typeof result === 'string' && result ? result : void 0;
}

export class Common {
	declare protected static cache: Map<string, any>;
	protected static bindCache: Map<string, RefCache<any>> = new Map();

	protected static clearCache() {
		this.cache.clear();
	}

	protected static deleteCache(id: string) {
		this.cache.delete(id);
	}

	protected static hasCache(id: string) {
		return this.cache.has(id);
	}

	protected static hasBindCache(id: string) {
		return this.bindCache.has(id);
	}

	protected static getBindCache<T>(id: string) {
		return this.bindCache.get(id) as RefCache<T>;
	}

	protected static setBindCache<T>(id: string, cache: RefCache<T>) {
		this.bindCache.set(id, cache);
	}

	protected static filterBindCache(ids: string[]) {
		this.bindCache.forEach((_, id) => {
			if (!ids.includes(id)) {
				this.bindCache.delete(id);
			}
		});
	}

	protected static createRef<T>() {
		let trigger: Fn<[]>;
		let track: Fn<[]>;
		let value: T[] = [];
		const state = customRef((_track, _trigger) => {
			track = _track;
			trigger = _trigger;
			return {
				get: () => value,
				set: () => {},
			};
		});
		const update = (newValue: T[]) => {
			value = newValue;
			trigger();
		};
		return { ref: state, track: track!, update };
	}

	/**
	 * 创建按字段名索引的请求状态。
	 *
	 * 替代每个类手写 `useVueStatusRef('title', ...)` 与 `titleRef` 代理：
	 * `get()` 读取 ref 时建立响应式依赖并返回布尔值，保持组件 `:loading="series.titleRef"` 的用法不变。
	 */
	protected createStatus(...keys: string[]): StatusController {
		const flags = new Map<string, Ref<boolean>>();
		for (const key of keys) {
			flags.set(key, ref(false));
		}
		return {
			get(key) {
				return flags.get(key)!.value;
			},
			async run(key, task) {
				const flag = flags.get(key)!;
				flag.value = true;
				try {
					return await task();
				} finally {
					flag.value = false;
				}
			},
		};
	}
}
