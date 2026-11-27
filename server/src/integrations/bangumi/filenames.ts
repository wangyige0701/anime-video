/**
 * 本地视频文件名解析。
 *
 * 顺序的唯一依据是文件名里的编号：`00-特别篇.mp4` 的 00 就是第 0 集，
 * `[Studio GreenTea] ... S3 [09]` 的 09 就是第 9 集。纯字符串排序不可用 ——
 * 方括号开头的文件名会被排到数字文件名之前，混排目录整季错位。
 */

const RESOLUTION = /^(480|576|720|1080|1440|2160)p$/i;
const CODEC = /^(x|h)?26[45]$|^hevc$|^avc$/i;
const AUDIO = /^(aac|flac|opus|jp|jpn|jpsc|jpsc\+|chs|cht|gb|big5)$/i;

/** 分辨率、编码、音轨、年份、CRC 这类数字不是集号 */
function isNumberNoise(value: string, raw: string) {
	if (RESOLUTION.test(value) || CODEC.test(value) || AUDIO.test(value)) {
		return true;
	}
	if (/^\d{4}$/.test(raw) && Number(raw) >= 1900 && Number(raw) <= 2099) {
		return true;
	}
	return /^[0-9a-f]{8}$/i.test(raw) && /[a-f]/i.test(raw);
}

/**
 * 从文件名解析集号，解析不到返回 undefined。
 *
 * 规则按可靠性从高到低排列：标准 SxxEyy → 「第 N 话」→ 方括号/圆括号编号 →
 * 「 - N」→ 前缀编号。前缀编号这条同时覆盖了 `00-特别篇.mp4` 这种第 0 话，
 * 因此不能只认空格分隔，`-` 也算分隔符。
 */
export function parseEpisodeNumber(fileName: string): number | undefined {
	const name = fileName.replace(/\.[^.]+$/, '');
	const rules = [
		/\bS\d{1,2}\s*E(?:P)?\s*(\d{1,4})\b/i,
		/[第]\s*(\d{1,4})\s*[话話集回]/,
		/[（(\[]\s*(\d{1,3})(?:v\d)?\s*[)）\]]/g,
		/\s-\s*(\d{1,3})(?:v\d)?(?:\s|$)/,
	];
	for (const rule of rules) {
		if (rule.global) {
			for (const match of name.matchAll(rule)) {
				if (!isNumberNoise(match[1]!, match[1]!)) {
					return Number(match[1]);
				}
			}
			continue;
		}
		const match = name.match(rule);
		if (match && !isNumberNoise(match[1]!, match[1]!)) {
			return Number(match[1]);
		}
	}
	const bare = name.match(/^(\d{1,3})(?:v\d)?(?:[\s.\-_]|$)/);
	if (bare && !isNumberNoise(bare[1]!, bare[1]!)) {
		return Number(bare[1]);
	}
	return undefined;
}

/**
 * 文件名是否带特别篇标记。
 *
 * 只用于「解析不出集号」时的兜底归属，不能反过来推断内容：
 * `00-特别篇.mp4` 实际是第 0 集正片，标记与内容不符的情况真实存在。
 */
export function hasSpecialMarker(fileName: string) {
	return /(^|[^a-z])(sp|ova|oad|nced|ncop|special|特别篇|特別篇|番外)([^a-z]|$)/i.test(
		fileName.replace(/\.\w+$/, ''),
	);
}

/** 文件名自然排序：数字按数值比较，其余按中文区域规则 */
export function naturalCompare(a: string, b: string) {
	return a.localeCompare(b, 'zh-CN', { numeric: true });
}
