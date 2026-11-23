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
 */
export async function patchField<T extends object, K extends keyof T>(
	values: FieldRefs<T>,
	status: StatusController,
	key: K,
	next: T[K],
	commit: () => Promise<unknown>,
): Promise<boolean> {
	const target = values[key];
	const oldValue = target.value;
	target.value = next;
	try {
		await status.run(key as string, commit);
		return true;
	} catch {
		target.value = oldValue;
		return false;
	}
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
