import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Series } from '~server/data/series';
import { DATA_FILE } from '~config/server';
import { Season } from '~server/data/season';
import { Episode } from '~server/data/episode';

describe('Video Data Config', () => {
	const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './videos');
	const configPath = path.join(process.cwd(), DATA_FILE);
	const dataPath = path.resolve(dir, DATA_FILE);

	it('Should set video directory', async () => {
		try {
			await fs.access(configPath);
			await fs.unlink(configPath);
		} catch (error) {}
		await Series.setDirectories(dir);
		const directories = await Series.getDirectories();
		expect(directories).toEqual([dir]);
	});

	it('Should get full video data', async () => {
		try {
			await fs.access(dataPath);
			await fs.unlink(dataPath);
		} catch (error) {}

		await Series.setDirectories(dir);
		const allSeries = await Series.getAllSeries();

		const series = allSeries[0];
		expect(await series.id).toBe(Series.hash(await series.path));
		expect(await series.path).toBe(path.resolve(dataPath, '..', '视频1'));
		expect(await series.name).toBe('视频1');
		expect(await series.title).toBe('视频1');
		expect(await series.images).toEqual([path.join(dir, '视频1', '1.webp'), path.join(dir, '视频1', '2.jpg')]);
		expect(await series.description).toBe('');
		expect(await series.tags).toEqual([]);

		const season1 = new Season('第一季', series);
		await season1.updateSort(3);
		await series.getDataInstance().save();
		const season2 = new Season('第二季', series);
		await season2.updateSort(4);
		const season = (await series.seasons)[0];
		await series.getDataInstance().save();
		expect(await season.id).toBe(await season1.id);
		expect(await season.id).toBe(Series.hash(await season.path));
		expect(await season.path).toBe(path.resolve(dataPath, '..', '视频1', '第一季'));
		expect(await season.sort).toBe(3);
		expect(await season.title).toBe('第一季');
		// 测试文件内容更新
		await season.updateTitle('测试第一季');
		await series.getDataInstance().save();
		const json1 = await fs.readFile(dataPath, 'utf-8');
		const data1 = JSON.parse(json1);
		const expectSeasonId = await season.id;
		expect(data1[0].seasons.find((item: any) => item.id === expectSeasonId)?.title).toBe('测试第一季');

		const episode1 = new Episode('1.mp4', season);
		await episode1.updateSort(3);
		const episode2 = new Episode('2.mp4', season);
		await episode2.updateSort(4);
		const episode = (await season.episodes)[0];
		expect(await episode.id).toBe(await episode1.id);
		expect(await episode.id).toBe(Series.hash(await episode.path));
		expect(await episode.path).toBe(path.resolve(dataPath, '..', '视频1', '第一季', '1.mp4'));
		expect(await episode.sort).toBe(3);
		expect(await episode.title).toBe('1');
		// 测试文件内容更新
		await episode.updateTitle('测试1');
		await series.getDataInstance().save();
		const json2 = await fs.readFile(dataPath, 'utf-8');
		const data2 = JSON.parse(json2);
		const expectEpisodeId = await episode.id;
		const seasonData = data2[0].seasons.find((item: any) => item.id === expectSeasonId);
		expect(seasonData?.episodes.find((item: any) => item.id === expectEpisodeId)?.title).toBe('测试1');
	});
});
