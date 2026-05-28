import path from 'node:path';
import { DATA_FILE } from '@config/server';
import { ConfigFile } from './configFile';

export class Data {
	/**
	 * 获取所有视频系列目录
	 */
	public static async getDirectories() {
		return await ConfigFile.instance<string[]>(path.resolve(process.cwd(), DATA_FILE), []).read();
	}

	/**
	 * 检查目录是否被允许，所有视频、图片资源文件目录必须在允许的目录中
	 *
	 * @param directory 视频系列目录
	 */
	public static async isAllowedDirectory(directory: string) {
		const directories = await this.getDirectories();
		const handleDirectory = path.resolve(directory);
		return !!directories.find((item) => {
			return handleDirectory.startsWith(item);
		});
	}

	constructor() {}
}
