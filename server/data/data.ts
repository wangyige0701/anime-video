import fs from 'node:fs/promises';
import path from 'node:path';
import { createPromise, isArray, isObject, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import { DATA_FILE } from '@config/server';
import { isFileExist } from '@server/src/utils/fs';

/**
 * 配置文件数据获取
 *
 * - 根据传入的配置文件目录自动拼接配置文件路径，并读取
 * - 将读取的数据写入内存，并接管
 * - 需要对获取的数据进行代理，可以拦截数据更新行为，重新写入新的配置文件
 */
export class Data<T extends object> {
	private static delayTime = 500;
	private static cache: Map<string, Data<any>> = new Map();
	private static proxyMap: WeakMap<object, object> = new WeakMap();

	/**
	 * 获取配置文件实例
	 * @param configPath 配置文件路径
	 * @param defaultContent 默认内容
	 */
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
		const _path = path.join(configPath, DATA_FILE);
		if (Data.cache.has(_path)) {
			return Data.cache.get(_path)! as Data<T>;
		}
		Data.cache.set(_path, this);

		this.configPath = _path;
		this.tmpPath = path.join(path.dirname(this.configPath), path.basename(this.configPath) + '.tmp');
		this.data = this.doRead();
	}

	private proxy<P extends object>(data: P): P {
		if (Data.proxyMap.has(data)) {
			return Data.proxyMap.get(data)! as P;
		}
		const proxy = new Proxy<P & object>(data, {
			get: (target, prop, receiver) => {
				const value = Reflect.get(target, prop, receiver);
				if (!isObject(value) && !isArray(value)) {
					return value;
				}
				return this.proxy(value);
			},
			set: (target, prop, value, receiver) => {
				const oldValue = Reflect.get(target, prop, receiver);
				if (oldValue === value) {
					return true;
				}
				// 数据更新，需要保存
				const result = Reflect.set(target, prop, value, receiver);
				if (result) {
					if (isObject(value) || isArray(value)) {
						this.proxy(value);
					}
					this.save();
				}
				return result;
			},
		});

		Data.proxyMap.set(data, proxy);

		return proxy;
	}

	private async doRead() {
		if (await isFileExist(this.tmpPath)) {
			// 检查临时文件是否存在，如果存在则说明上次保存时发生了错误，应该使用临时文件恢复数据
			await fs.rename(this.tmpPath, this.configPath);
		}
		if (!(await isFileExist(this.configPath))) {
			// 数据文件不存在，使用默认内容填充
			await fs.writeFile(this.configPath, JSON.stringify(this.defaultContent, null, 2), 'utf-8');
		}
		const content = await fs.readFile(this.configPath, 'utf-8');
		return this.proxy<T>(JSON.parse(content) as T);
	}

	/**
	 * 读取配置文件内容
	 */
	public read() {
		return this.data;
	}

	private saveTimeout?: NodeJS.Timeout;
	// 工作
	private isSaveWorking = false;
	private saveWorkQueue: Array<[PromiseResolve<void>, PromiseReject]> = [];
	// 等待
	private isSaveWaiting = false;
	private saveWaitQueue: Array<[PromiseResolve<void>, PromiseReject]> = [];
	private saveWaitingResolve?: PromiseResolve<void>;

	private async doSave() {
		if (this.isSaveWorking) {
			this.isSaveWaiting = true;
			return;
		}
		this.isSaveWorking = true;

		try {
			await fs.writeFile(this.tmpPath, JSON.stringify(await this.data, null, 2), 'utf-8');
			await fs.rename(this.tmpPath, this.configPath);
			this.saveWorkQueue.forEach(([resolve]) => resolve());
		} catch (error) {
			this.saveWorkQueue.forEach(([_, reject]) => reject(error));
		}

		const waitQueue = this.saveWaitQueue.splice(0);
		this.saveWorkQueue.splice(0, this.saveWorkQueue.length, ...waitQueue);

		this.isSaveWorking = false;
		if (this.isSaveWaiting) {
			this.isSaveWaiting = false;
			Promise.resolve().then(() => {
				this.flushSave();
			});
		}
	}

	private flushSave(resolve?: PromiseResolve<void>, reject?: PromiseReject) {
		if (!this.saveWaitingResolve) {
			const { resolve: saveResolve, promise } = createPromise<void>();
			promise.then(() => {
				return this.doSave();
			});
			this.saveWaitingResolve = saveResolve;
		}

		if (resolve && reject) {
			if (this.isSaveWaiting) {
				this.saveWaitQueue.push([resolve, reject]);
			} else {
				this.saveWorkQueue.push([resolve, reject]);
			}
		}

		this.saveTimeout && clearTimeout(this.saveTimeout);
		this.saveTimeout = setTimeout(() => {
			const saveResolve = this.saveWaitingResolve;
			this.saveWaitingResolve = void 0;
			this.saveTimeout = void 0;
			if (saveResolve) {
				saveResolve();
			}
		}, Data.delayTime);
	}

	/**
	 * 保存配置文件内容
	 *
	 * - save() -> 返回 promise，resolve 和 reject 通过 flushSave 保存起来
	 * - flushSave() -> 一个工作流同时只有一个 promise，通过 timeout 和 全局提出的 resolve 方法控制延迟触发和防抖
	 * - flushSave 的唯一 promise 回调后，触发 doSave
	 * - doSave() -> 通过一个状态判断是否正在保存中，如果在保存则等待，否则立即保存
	 * - 保存操作完成后，触发 resolve 或 reject，并且将等待队列中的数据替换到工作队列，如果有等待状态则在下一个微队列中触发 flushSave
	 */
	public async save() {
		const { resolve, reject, promise } = createPromise<void>();
		this.flushSave(resolve, reject);

		return promise;
	}
}
