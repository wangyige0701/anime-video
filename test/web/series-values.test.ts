import { describe, expect, it } from 'vitest';
import { getSeriesImageName, mergeUnique } from '../../web/src/utils/series';

describe('mergeUnique', () => {
	it('按追加语义合并，保留原有顺序', () => {
		expect(mergeUnique([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
	});

	it('已存在的项不再重复追加', () => {
		expect(mergeUnique([1, 2, 3], [2, 3, 4])).toEqual([1, 2, 3, 4]);
	});

	it('新增数组内部的重复项只保留一个', () => {
		expect(mergeUnique([1], [2, 2, 2])).toEqual([1, 2]);
	});

	it('没有新增项时返回原数组的副本', () => {
		const current = [1, 2];
		const result = mergeUnique(current, []);
		expect(result).toEqual([1, 2]);
		expect(result).not.toBe(current);
	});
});

describe('getSeriesImageName', () => {
	it('Windows 绝对路径截掉系列目录前缀', () => {
		expect(getSeriesImageName('D:\\video\\某系列', 'D:\\video\\某系列\\cover.jpg')).toBe('cover.jpg');
		expect(getSeriesImageName('D:\\video\\某系列', 'D:\\video\\某系列\\sub\\cover.jpg')).toBe('sub\\cover.jpg');
	});

	it('系列目录带尾部分隔符时同样能截断', () => {
		expect(getSeriesImageName('D:\\video\\某系列\\', 'D:\\video\\某系列\\cover.jpg')).toBe('cover.jpg');
		expect(getSeriesImageName('/mnt/video/某系列/', '/mnt/video/某系列/cover.jpg')).toBe('cover.jpg');
	});

	it('不在系列目录下的绝对路径退化为文件名', () => {
		expect(getSeriesImageName('D:\\video\\某系列', 'E:\\other\\cover.jpg')).toBe('cover.jpg');
	});

	it('只有文件名或系列目录为空时原样取文件名', () => {
		expect(getSeriesImageName('D:\\video\\某系列', 'cover.jpg')).toBe('cover.jpg');
		expect(getSeriesImageName('', 'D:\\video\\某系列\\cover.jpg')).toBe('cover.jpg');
	});
});
