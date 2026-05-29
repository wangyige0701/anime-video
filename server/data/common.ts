import { DATA_FILE } from '@config/server';
import path from 'node:path';
import { Data } from './data';

export class Common {
	private static __path = path.join(process.cwd(), DATA_FILE);

	/**
	 * 获取所有视频系列根目录配置数据
	 */
	public static async getDirectories() {
		return await Data.instance<string[]>(this.__path, []).read();
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
}
