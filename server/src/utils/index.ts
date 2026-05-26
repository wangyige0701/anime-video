import crypto from 'node:crypto';

/**
 * 对字符串进行md5哈希处理
 */
export function hash(str: string) {
	return crypto.createHash('md5').update(str).digest('hex');
}
