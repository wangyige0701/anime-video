import { createPromise, isArray, isObject, PromiseReject, PromiseResolve } from '@wang-yige/utils';
import fs from 'node:fs/promises';
import path from 'node:path';

export class ConfigFile<T extends any[] | object> {
	private static cache: Map<string, ConfigFile<any>> = new Map();

	/**
	 * 获取配置文件实例
	 * @param configPath 配置文件路径
	 * @param defaultContent 默认内容
	 */
	public static instance<T extends any[] | object>(configPath: string, defaultContent: T = [] as T) {
		return new ConfigFile<T>(configPath, defaultContent);
	}

	private configPath!: string;
	private tmpPath!: string;
	private data!: Promise<T>;
	private dataType: 'object' | 'array';

	constructor(
		configPath: string,
		private defaultContent: T = [] as T,
	) {
		const _path = path.resolve(configPath);
		if (isArray(defaultContent)) {
			this.dataType = 'array';
		} else if (isObject(defaultContent)) {
			this.dataType = 'object';
		} else {
			throw new Error('默认内容必须是对象或数组');
		}
		if (ConfigFile.cache.has(_path)) {
			return ConfigFile.cache.get(_path)! as ConfigFile<T>;
		}
		ConfigFile.cache.set(_path, this);

		this.configPath = _path;
		this.tmpPath = path.join(path.dirname(this.configPath), path.basename(this.configPath, '.tmp'));
		this.data = this.doRead();
	}

	private async doRead() {
		try {
			// 检查临时文件是否存在，如果存在则说明上次保存时发生了错误，应该使用临时文件恢复数据
			await fs.access(this.tmpPath);
			await fs.rename(this.tmpPath, this.configPath);
		} catch (error) {}
		try {
			await fs.access(this.configPath);
		} catch (error) {
			await fs.writeFile(this.configPath, JSON.stringify(this.defaultContent, null, 2), 'utf-8');
		}
		const content = await fs.readFile(this.configPath, 'utf-8');
		return JSON.parse(content) as T;
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
		}, 300);
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

	public async set(key: string, value: any) {
		if (this.dataType === 'object') {
			const data = (await this.data) as Record<string, any>;
			data[key] = value;
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async get(key: string) {
		if (this.dataType === 'object') {
			return ((await this.data) as Record<string, any>)[key];
		}
		return void 0;
	}

	public async delete(key: string) {
		if (this.dataType === 'object') {
			const data = (await this.data) as Record<string, any>;
			delete data[key];
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async find(fn: (item: T) => boolean) {
		if (this.dataType === 'array') {
			return ((await this.data) as T[]).find(fn);
		}
		return void 0;
	}

	public async push(item: T) {
		if (this.dataType === 'array') {
			const data = (await this.data) as T[];
			data.push(item);
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async pop() {
		if (this.dataType === 'array') {
			const data = (await this.data) as T[];
			data.pop();
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async shift() {
		if (this.dataType === 'array') {
			const data = (await this.data) as T[];
			data.shift();
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async unshift(item: T) {
		if (this.dataType === 'array') {
			const data = (await this.data) as T[];
			data.unshift(item);
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}

	public async splice(start: number, deleteCount?: number, ...items: T[]) {
		if (this.dataType === 'array') {
			const data = (await this.data) as T[];
			data.splice(start, deleteCount ?? 0, ...items);
			this.data = Promise.resolve(data as T);
			await this.save();
		}
		return this;
	}
}
