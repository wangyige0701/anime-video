import fs from 'node:fs/promises';
import path from 'node:path';
import { isArray, isObject } from '@wang-yige/utils';
import { isFileExist } from '~server/src/utils/fs';
import { isEqual } from '~server/src/utils/is';

/** 负责 JSON 配置文件的读取、代理修改和防抖持久化。 */
export class Data<T extends object> {
	private static delayTime = +__APP_CONFIG__.server.dataFileSaveDelay;
	// 相同配置路径在进程内共享一个实例，避免多套保存队列同时写入同一文件。
	private static cache: Map<string, Data<any>> = new Map();
	// 代理会递归包装嵌套对象；用 WeakMap 保证同一原始对象只生成一次代理且可被回收。
	private static proxyMap: WeakMap<object, object> = new WeakMap();

	public static instance<T extends object>(configPath: string, defaultContent: T = [] as T) {
		return new Data<T>(configPath, defaultContent);
	}

	private configPath!: string;
	private tmpPath!: string;
	private data!: Promise<T>;

	constructor(
		configPath: string,
		private defaultContent: T,
	) {
		const resolvedPath = path.resolve(configPath);
		if (Data.cache.has(resolvedPath)) {
			// 构造函数允许直接返回已存在实例，保证调用方始终写入同一份内存数据。
			return Data.cache.get(resolvedPath)! as Data<T>;
		}
		Data.cache.set(resolvedPath, this);

		this.configPath = resolvedPath;
		this.tmpPath = path.join(path.dirname(this.configPath), `${path.basename(this.configPath)}.tmp`);
		this.data = this.doRead();
	}

	private proxy<P extends object>(data: P): P {
		if (Data.proxyMap.has(data)) {
			return Data.proxyMap.get(data)! as P;
		}

		const proxy = new Proxy<P>(data, {
			get: (target, prop, receiver) => {
				const value = Reflect.get(target, prop, receiver);
				// 嵌套对象和数组也必须代理，才能感知如 config.items.push() 的修改。
				return isObject(value) || isArray(value) ? this.proxy(value) : value;
			},
			set: (target, prop, value, receiver) => {
				const oldValue = Reflect.get(target, prop, receiver);
				// 值没有实际变化时不增加版本号，也不会触发无意义的磁盘写入。
				if (isEqual(oldValue, value)) {
					return true;
				}
				const result = Reflect.set(target, prop, value, receiver);
				if (result) {
					this.markDirty();
				}
				return result;
			},
			deleteProperty: (target, prop) => {
				if (!Reflect.has(target, prop)) {
					return true;
				}
				const result = Reflect.deleteProperty(target, prop);
				if (result) {
					this.markDirty();
				}
				return result;
			},
		});

		Data.proxyMap.set(data, proxy);
		return proxy;
	}

	private async doRead() {
		if (await isFileExist(this.tmpPath)) {
			try {
				// 临时文件写入完成但 rename 尚未执行时，临时文件才是最新的完整快照。
				JSON.parse(await fs.readFile(this.tmpPath, 'utf-8'));
			} catch {
				// 损坏的临时文件不能覆盖正式配置；删除后继续读取已有文件或创建默认值。
				await fs.unlink(this.tmpPath);
			}
			if (await isFileExist(this.tmpPath)) {
				// rename 在同一目录内完成替换，避免直接写正式文件时进程中断导致半截 JSON。
				await fs.rename(this.tmpPath, this.configPath);
			}
		}
		if (!(await isFileExist(this.configPath))) {
			// 首次使用或无法恢复旧数据时，写入调用方给出的默认配置。
			await fs.writeFile(this.configPath, JSON.stringify(this.defaultContent), 'utf-8');
		}
		return this.proxy<T>(JSON.parse(await fs.readFile(this.configPath, 'utf-8')) as T);
	}

	public read() {
		return this.data;
	}

	private saveTimeout?: NodeJS.Timeout;
	// 同一 Data 实例内一次只允许一个实际写盘任务执行。
	private isSaveWorking = false;
	// 脏标记用于跳过没有修改的数据扫描所触发的 save()。
	private isDirty = false;
	// revision 是内存版本，savedRevision 是最后确认落盘的版本。
	private revision = 0;
	private savedRevision = 0;
	private saveWaiters: Array<{
		revision: number;
		resolve: () => void;
		reject: (error: unknown) => void;
	}> = [];

	private markDirty() {
		this.isDirty = true;
		this.revision++;
		// 每次修改重置定时器，将短时间内的连续更新合并为一次写盘。
		this.scheduleSave();
	}

	private scheduleSave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(() => {
			this.saveTimeout = undefined;
			void this.doSave();
		}, Data.delayTime);
	}

	private settleSaveWaiters(revision: number, error?: unknown) {
		const pendingWaiters: typeof this.saveWaiters = [];
		for (const waiter of this.saveWaiters) {
			// 更晚版本的调用者必须等待下一次写盘，不能随当前快照提前完成。
			if (waiter.revision > revision) {
				pendingWaiters.push(waiter);
			} else if (error) {
				waiter.reject(error);
			} else {
				waiter.resolve();
			}
		}
		this.saveWaiters = pendingWaiters;
	}

	private async doSave() {
		if (this.isSaveWorking || this.savedRevision >= this.revision) {
			// 已有任务在写入或当前版本已落盘时，无需重复启动写盘。
			return;
		}

		this.isSaveWorking = true;
		const revision = this.revision;
		let didSave = false;
		try {
			// 先写临时文件，再替换正式文件，保证正式文件始终是完整 JSON。
			await fs.writeFile(this.tmpPath, JSON.stringify(await this.data), 'utf-8');
			await fs.rename(this.tmpPath, this.configPath);
			this.savedRevision = revision;
			this.isDirty = this.savedRevision < this.revision;
			didSave = true;
			this.settleSaveWaiters(revision);
		} catch (error) {
			// 仅拒绝本次快照已经覆盖的版本；写入期间的新修改仍可在后续任务中保存。
			this.settleSaveWaiters(revision, error);
		} finally {
			this.isSaveWorking = false;
		}

		// 成功写入或写入期间出现了新版本时，继续处理尚未落盘的数据。
		if ((didSave || this.revision > revision) && this.savedRevision < this.revision && !this.saveTimeout) {
			this.scheduleSave();
		}
	}

	/**
	 * 请求将当前内存版本写入磁盘。
	 * - `save()` 返回的 Promise 会在调用时对应版本完成持久化后 resolve。
	 * - `save(false)` 用于无等待的强制保存。
	 */
	public save(needPromise = true) {
		if (!needPromise) {
			this.markDirty();
			return;
		}

		if (!this.isDirty && !this.isSaveWorking && !this.saveTimeout) {
			return Promise.resolve();
		}
		const revision = this.revision;
		const promise = new Promise<void>((resolve, reject) => {
			this.saveWaiters.push({ revision, resolve, reject });
		});
		// 写入失败后的重试由下一次显式 save 驱动，避免后台无限重试；此处保证队列会重新启动。
		if (!this.isSaveWorking && !this.saveTimeout) {
			this.scheduleSave();
		}
		return promise;
	}
}
