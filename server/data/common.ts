import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
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
	private static __path = path.join(process.cwd(), getDataFile());

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
	 * 解析真实路径；不存在的叶子节点会基于最近的可解析祖先重建路径。
	 *
	 * 例子：
	 * - `C:\\videos` 是指向 `D:\\media` 的 Junction，`C:\\videos\\series\\.video.json`
	 *   尚未创建时，会解析为 `D:\\media\\series\\.video.json`。
	 * - 已存在的 `C:\\videos\\series\\1.mp4` 会直接由 `realpath` 解析为真实位置。
	 * - `C:\\videos\\new-series` 尚未创建时，会先解析 `C:\\videos`，再拼回
	 *   `new-series`，从而仍可按真实根目录判断授权范围。
	 */
	private static async resolveRealPath(directory: string) {
		const resolvedDirectory = path.resolve(directory);
		let currentDirectory = resolvedDirectory;
		const missingSegments: string[] = [];
		while (true) {
			try {
				return path.join(await fs.realpath(currentDirectory), ...missingSegments);
			} catch {
				const parentDirectory = path.dirname(currentDirectory);
				if (parentDirectory === currentDirectory) {
					return resolvedDirectory;
				}
				missingSegments.unshift(path.basename(currentDirectory));
				currentDirectory = parentDirectory;
			}
		}
	}

	/**
	 * 检查目录是否被允许，所有视频、图片资源文件目录必须在允许的目录中
	 *
	 * @param directory 视频系列目录绝对路径
	 */
	public static async isAllowedDirectory(directory: string) {
		const directories = await this.getDirectories();
		// 已存在的资源使用真实路径；待创建文件则从真实祖先恢复路径，避免符号链接或 Junction 绕过限制。
		const handleDirectory = await Common.resolveRealPath(directory);
		for (const item of directories) {
			const rootDirectory = await Common.resolveRealPath(item);
			const relativePath = path.relative(rootDirectory, handleDirectory);
			if (relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))) {
				return true;
			}
		}
		return false;
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

function getDataFile() {
	return (process.env.VIDEO_CONFIG_PREFIX || '') + __APP_CONFIG__.server.dataFile;
}
