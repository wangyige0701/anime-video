import type { Fn } from '@wang-yige/utils';
import { customRef } from 'vue';

type RefCache<T> = { ref: Ref<T[]>; update: Fn<[T[]]>; track: Fn<[]> } | undefined;

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
		const ref = customRef((_track, _trigger) => {
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
		return { ref, track: track!, update };
	}
}
