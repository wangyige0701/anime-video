import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_FILE } from '~config/server';
import { Data } from './data';
import { RestElements } from '@wang-yige/utils';

type PickType<
	T extends Record<string, any>,
	K extends (keyof T)[],
	U extends Record<string, any> = {},
> = K['length'] extends 0 ? U : PickType<T, RestElements<K>, U & { [P in K[0]]: T[P] }>;

type OmitType<
	T extends Record<string, any>,
	K extends (keyof T)[],
	U extends Record<string, any> = T,
> = K['length'] extends 0 ? U : OmitType<T, RestElements<K>, K[0] extends keyof T ? Omit<T, K[0]> : U>;

export abstract class Common {
	// 缓存处理
	declare protected static cache: Map<string, any>;

	/**
	 * 清空所有缓存，需要针对子类也执行清空操作，所以使用异步
	 */
	public static async clearCache() {
		throw new Error('Method not implemented.');
	}

	/**
	 * 删除指定缓存，需要针对子类也执行删除操作，所以使用异步
	 *
	 * @param id 缓存键
	 */
	public static async deleteCache(id: string) {
		throw new Error('Method not implemented.');
	}

	protected static getCache<T>(id: string): T | undefined {
		return this.cache.get(id) as T;
	}

	protected static hasCache(id: string) {
		return this.cache.has(id);
	}

	// 数据文件
	private static __path = path.join(process.cwd(), DATA_FILE);

	/**
	 * 获取所有视频系列根目录配置数据
	 */
	public static async getDirectories() {
		return await Data.instance<string[]>(this.__path, []).read();
	}

	/**
	 * 重置视频系列目录配置数据，只会更新文件数据，不会刷新系列缓存，需要手动调用方法更新
	 *
	 * - 此方法会等待数据保存完成，确保数据一致性
	 */
	public static async setDirectories(...directories: string[]) {
		const data = await this.getDirectories();
		data.splice(0, data.length, ...directories.map((item) => path.resolve(item)));
		await Data.instance<string[]>(this.__path, []).save();
	}

	/**
	 * 检查目录是否被允许，所有视频、图片资源文件目录必须在允许的目录中
	 *
	 * @param directory 视频系列目录绝对路径
	 */
	public static async isAllowedDirectory(directory: string) {
		const directories = await this.getDirectories();
		const handleDirectory = path.resolve(directory);
		return !!directories.find((item) => {
			return handleDirectory.startsWith(item);
		});
	}

	/**
	 * 对字符串进行md5哈希处理
	 */
	public static hash(str: string) {
		return crypto.createHash('md5').update(str).digest('hex');
	}

	/**
	 * 从对象中提取指定属性
	 */
	public static pick<T extends Record<string, any>, K extends (keyof T)[]>(obj: T, keys: K) {
		return keys.reduce((prev, cur) => {
			prev[cur] = obj[cur];
			return prev;
		}, {} as T) as PickType<T, K>;
	}

	/**
	 * 从对象中移除指定属性
	 */
	public static omit<T extends Record<string, any>, K extends (keyof T)[]>(obj: T, keys: K) {
		return Object.keys(obj).reduce((prev, cur) => {
			if (!keys.includes(cur)) {
				prev[cur as keyof T] = obj[cur];
			}
			return prev;
		}, {} as T) as OmitType<T, K>;
	}
}
