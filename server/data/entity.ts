import { Common } from './common';

/**
 * 领域对象字段基类。
 *
 * 每个可编辑字段原先需要「声明 `_x`、写 getter、写 `registerX()`、在 `getValue()` 与
 * `resolveXConfig()` 里各写一次」，新增字段要改 6 处以上。这里把「按需从配置派生字段值」
 * 收敛成一次 `field()` 调用：首次读取时基于配置生成 Promise 并缓存，写入或刷新后按字段失效。
 *
 * 对外契约保持不变：字段仍以 Promise getter 暴露，子类继续用
 * `implements ServerToPromise<...>` 约束自身结构。
 *
 * @typeParam S 配置文件中的原始数据结构
 * @typeParam V 对外（接口 DTO）数据结构，不含子级集合
 */
export abstract class Entity<S extends { id: string }, V extends object> extends Common {
	/** 已解析的配置对象；子类必须在构造函数中赋值，再由 `initialize()` 完成 resolve */
	protected store!: Promise<S>;

	/** 字段派生缓存，key 为配置字段名；写入或配置被原地改写后按 key 失效 */
	private fields = new Map<string, Promise<unknown>>();

	/**
	 * 读取字段的对外值。
	 *
	 * @param key 配置字段名
	 * @param read 配置值到对外值的映射；图片、路径等需要排序或拼接的字段必须提供
	 */
	protected field<K extends keyof S & keyof V>(key: K, read?: (store: S) => V[K]): Promise<V[K]> {
		const cached = this.fields.get(key as string) as Promise<V[K]> | undefined;
		if (cached) {
			return cached;
		}
		const value = this.store.then((store) => (read ? read(store) : (store[key] as unknown as V[K])));
		this.fields.set(key as string, value);
		return value;
	}

	/** 覆盖字段值并让该字段缓存失效，下次读取时重新从配置派生 */
	protected async write<K extends keyof S & keyof V>(key: K, value: S[K]) {
		const store = await this.store;
		store[key] = value;
		this.fields.delete(key as string);
	}

	/** 原地修改字段（如数组 push），保留配置对象引用并让字段缓存失效 */
	protected async mutate<K extends keyof S & keyof V>(key: K, updater: (value: S[K]) => void) {
		const store = await this.store;
		updater(store[key]);
		this.fields.delete(key as string);
	}

	/** 丢弃全部字段缓存，用于配置被原地改写后的重新派生 */
	protected invalidate() {
		this.fields.clear();
	}

	/** 批量读取字段组装 DTO，键顺序与传入顺序一致 */
	protected async collect<K extends keyof V>(keys: readonly K[]): Promise<Pick<V, K>> {
		const values = await Promise.all(keys.map((key) => this.field(key as unknown as keyof S & keyof V)));
		return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Pick<V, K>;
	}
}
