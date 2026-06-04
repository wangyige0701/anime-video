import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_FILE } from '~config/server';
import { Data } from './data';

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
}
