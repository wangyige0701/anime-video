import fs from 'node:fs/promises';
import path from 'node:path';
import { isArray, isObject } from '@wang-yige/utils';
import { isFileExist } from '~server/src/utils/fs';
import { isEqual } from '~server/src/utils/is';

/** 负责 JSON 配置文件的读取、代理修改和防抖持久化。 */
export class Data<T extends object> {
	private static delayTime = Number(process.env.DATA_FILE_SAVE_DELAY || 500);
	private static cache: Map<string, Data<any>> = new Map();
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
				return isObject(value) || isArray(value) ? this.proxy(value) : value;
			},
			set: (target, prop, value, receiver) => {
				const oldValue = Reflect.get(target, prop, receiver);
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
			if (await isFileExist(this.configPath)) {
				// 正式文件存在时，临时文件仅代表未完成或过期的写入。
				await fs.unlink(this.tmpPath);
			} else {
				try {
					// 只有可解析的临时文件才能恢复为正式文件。
					JSON.parse(await fs.readFile(this.tmpPath, 'utf-8'));
					await fs.rename(this.tmpPath, this.configPath);
				} catch {
					// 孤立且损坏的临时文件不是可靠数据，移除后按默认配置重新创建。
					await fs.unlink(this.tmpPath);
				}
			}
		}
		if (!(await isFileExist(this.configPath))) {
			await fs.writeFile(this.configPath, JSON.stringify(this.defaultContent), 'utf-8');
		}
		return this.proxy<T>(JSON.parse(await fs.readFile(this.configPath, 'utf-8')) as T);
	}

	public read() {
		return this.data;
	}

	private saveTimeout?: NodeJS.Timeout;
	private isSaveWorking = false;
	private isDirty = false;
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
			return;
		}

		this.isSaveWorking = true;
		const revision = this.revision;
		let didSave = false;
		try {
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
