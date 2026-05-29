import crypto from 'node:crypto';
import fs from 'node:fs/promises';

/**
 * 对字符串进行md5哈希处理
 */
export function hash(str: string) {
	return crypto.createHash('md5').update(str).digest('hex');
}

export async function isDirectory(path: string) {
	try {
		return (await fs.stat(path)).isDirectory();
	} catch (error) {
		return false;
	}
}

export async function isFileExist(path: string) {
	try {
		await fs.access(path);
		return true;
	} catch (error) {
		return false;
	}
}
