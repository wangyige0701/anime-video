import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Series } from '~server/data/series';
import { DATA_FILE } from '~config/server';
import { Season } from '~server/data/season';
import { Episode } from '~server/data/episode';
import { Data } from '~server/data/data';

describe('Video Data Config', () => {
	const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './videos');
	const configPath = path.join(process.cwd(), DATA_FILE);
	const dataPath = path.resolve(dir, DATA_FILE);

	async function getJsonFIle() {
		const json = await fs.readFile(dataPath, 'utf-8');
		const data = JSON.parse(json);
		return data;
	}

	it('Should set video directory', async () => {
		try {
			await fs.access(configPath);
			await fs.unlink(configPath);
		} catch (error) {}
		await Series.setDirectories(dir);
		const directories = await Series.getDirectories();
		expect(directories).toEqual([dir]);
		expect(await Series.isAllowedDirectory(`${dir}-outside`)).toBe(false);
	});

	it('Should preserve the valid data file when a stale temporary file exists', async () => {
		const tempPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-recovery.test.video.json');
		const tempFilePath = `${tempPath}.tmp`;
		try {
			await fs.writeFile(tempPath, JSON.stringify({ value: 'current' }));
			await fs.writeFile(tempFilePath, JSON.stringify({ value: 'stale' }));
			const data = new Data(tempPath, { value: 'default' });
			expect(await data.read()).toEqual({ value: 'current' });
			await expect(fs.access(tempFilePath)).rejects.toThrow();
		} finally {
			await Promise.all([fs.rm(tempPath, { force: true }), fs.rm(tempFilePath, { force: true })]);
		}
	});

	it('Should discard an invalid orphan temporary file and restore defaults', async () => {
		const tempPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-invalid-tmp.test.video.json');
		const tempFilePath = `${tempPath}.tmp`;
		try {
			await fs.writeFile(tempFilePath, '{invalid json');
			const data = new Data(tempPath, { value: 'default' });
			expect(await data.read()).toEqual({ value: 'default' });
			expect(await fs.readFile(tempPath, 'utf-8')).toBe(JSON.stringify({ value: 'default' }));
			await expect(fs.access(tempFilePath)).rejects.toThrow();
		} finally {
			await Promise.all([fs.rm(tempPath, { force: true }), fs.rm(tempFilePath, { force: true })]);
		}
	});

	it('Should persist concurrent changes', async () => {
		const tempPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-concurrent.test.video.json');
		try {
			const data = new Data(tempPath, { value: 0 });
			const content = await data.read();
			content.value = 1;
			const firstSave = data.save();
			content.value = 2;
			const secondSave = data.save();
			await Promise.all([firstSave, secondSave]);
			expect(JSON.parse(await fs.readFile(tempPath, 'utf-8'))).toEqual({ value: 2 });
		} finally {
			await Promise.all([fs.rm(tempPath, { force: true }), fs.rm(`${tempPath}.tmp`, { force: true })]);
		}
	});

	it('Should operate data file correctly', async () => {
		// 针对 /data/data.ts 进行测试
		const testFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.test.video.json');
		try {
			await fs.access(testFilePath);
			await fs.unlink(testFilePath);
		} catch (error) {}

		try {
			const defaultContent = {
				name: 'test',
				value: 0,
				array: [] as string[],
				object: {} as Record<string, string>,
			};
			const data = new Data(testFilePath, defaultContent);

			const content = await data.read();
			expect(content).toEqual(defaultContent);
			expect(content.name).toBe('test');
			expect(content.value).toBe(0);
			expect(content.array).toEqual([]);
			expect(content.object).toEqual({});

			content.name = 'test2';
			content.value = 1;
			content.array.push('test3');
			content.object['test4'] = 'test5';
			await data.save();

			expect(content).toEqual({
				name: 'test2',
				value: 1,
				array: ['test3'],
				object: { test4: 'test5' },
			});
			expect(content.name).toBe('test2');
			expect(content.value).toBe(1);
			expect(content.array).toEqual(['test3']);
			expect(content.object).toEqual({ test4: 'test5' });

			const fileContent = await fs.readFile(testFilePath, 'utf-8');
			expect(JSON.parse(fileContent)).toEqual(content);
		} catch (error) {
			throw error;
		} finally {
			try {
				await fs.unlink(testFilePath);
			} catch (error) {}
		}
	});

	it('Should handle video data correctly', async () => {
		const originImagePath1 = path.join(dir, '视频1', '1.webp');
		const originImagePath2 = path.join(dir, '视频1', '2.jpg');
		// 新增图片
		const testImagePath1 = path.join(dir, '视频1', '测试.png');
		const testImagePath2 = path.join(dir, '视频1', '测试2.png');

		try {
			await fs.unlink(testImagePath1);
			await fs.unlink(testImagePath2);
		} catch (error) {}

		try {
			await fs.access(dataPath);
			await fs.unlink(dataPath);
		} catch (error) {}

		try {
			await Series.setDirectories(dir);
			const allSeries = await Series.getAllSeries();

			const series = allSeries[0];
			expect(await series.id).toBe(Series.hash(await series.path));
			expect(await series.path).toBe(path.resolve(dataPath, '..', '视频1'));
			expect(await series.name).toBe('视频1');
			expect(await series.title).toBe('视频1');
			expect(await series.images).toEqual([originImagePath1, originImagePath2]);
			expect(await series.description).toBe('');
			expect(await series.date).toEqual([]);
			expect(await series.types).toEqual([]);
			expect(await series.status).toBe(0);

			// 更新系列信息
			await series.updateTitle('测试视频标题');
			await series.updateDescription('测试视频描述');
			await series.updateDate(2026, 1);
			await series.updateTypes([1, 2]);
			await series.updateStatus(1);
			await series.getDataInstance().save();
			const dataSeries = await getJsonFIle();
			expect(dataSeries[0].title).toBe('测试视频标题');
			expect(dataSeries[0].description).toBe('测试视频描述');
			expect(dataSeries[0].date).toEqual([2026, 1]);
			expect(dataSeries[0].types).toEqual([1, 2]);
			expect(dataSeries[0].status).toBe(1);

			// 测试系列图片
			await fs.writeFile(testImagePath1, '');
			await fs.writeFile(testImagePath2, '');
			await series.addImages([path.basename(testImagePath1), path.basename(testImagePath2)]);
			await series.getDataInstance().save();
			const dataWithImage1 = await getJsonFIle();
			expect(await series.images).toEqual([originImagePath1, originImagePath2, testImagePath1, testImagePath2]);
			expect(dataWithImage1[0].images).toEqual([
				{
					path: path.basename(originImagePath1),
					sort: 1,
				},
				{
					path: path.basename(originImagePath2),
					sort: 2,
				},
				{
					path: path.basename(testImagePath1),
					sort: 3,
				},
				{
					path: path.basename(testImagePath2),
					sort: 4,
				},
			]);
			await fs.unlink(testImagePath2);
			await series.removeImages([path.basename(testImagePath2)]);
			await series.getDataInstance().save();
			const dataWithImage2 = await getJsonFIle();
			expect(dataWithImage2[0].images).toEqual([
				{
					path: path.basename(originImagePath1),
					sort: 1,
				},
				{
					path: path.basename(originImagePath2),
					sort: 2,
				},
				{
					path: path.basename(testImagePath1),
					sort: 3,
				},
			]);
			await series.updateImages([
				path.basename(testImagePath1),
				path.basename(originImagePath2),
				path.basename(originImagePath1),
			]);
			await series.getDataInstance().save();
			const dataWithImage3 = await getJsonFIle();
			expect(dataWithImage3[0].images).toEqual([
				{
					path: path.basename(testImagePath1),
					sort: 1,
				},
				{
					path: path.basename(originImagePath2),
					sort: 2,
				},
				{
					path: path.basename(originImagePath1),
					sort: 3,
				},
			]);
			await fs.unlink(testImagePath1);
			await series.removeImages([path.basename(testImagePath1)]);
			await series.getDataInstance().save();

			const season1 = new Season('第一季', series);
			await season1.updateSort(3);
			await series.getDataInstance().save();
			const season2 = new Season('第二季', series);
			const season = (await series.seasons)[0];
			await series.getDataInstance().save();
			expect(await season.id).toBe(await season1.id);
			expect(await season.id).toBe(Series.hash(await season.path));
			expect(await season.path).toBe(path.resolve(dataPath, '..', '视频1', '第一季'));
			expect(await season.sort).toBe(2);
			expect(await season2.sort).toBe(1);
			expect(await season.title).toBe('第一季');
			// 同一系列的排序更新会串行执行，并使用前一个任务完成后的最新位置。
			await Promise.all([season1.updateSort(1), season2.updateSort(2)]);
			expect(await season1.sort).toBe(1);
			expect(await season2.sort).toBe(2);
			// 测试文件内容更新
			await season.updateTitle('测试第一季');
			await series.getDataInstance().save();
			const dataSeason = await getJsonFIle();
			const expectSeasonId = await season.id;
			expect(dataSeason[0].seasons.find((item: any) => item.id === expectSeasonId)?.title).toBe('测试第一季');

			const episode1 = new Episode('1.mp4', season);
			await episode1.updateSort(2);
			const episode2 = new Episode('2.mp4', season);
			const episode = (await season.episodes)[0];
			expect(await episode.id).toBe(await episode1.id);
			expect(await episode.id).toBe(Series.hash(await episode.path));
			expect(await episode.path).toBe(path.resolve(dataPath, '..', '视频1', '第一季', '1.mp4'));
			expect(await episode.sort).toBe(2);
			expect(await episode2.sort).toBe(1);
			expect(await episode.title).toBe('1');
			// 同一季中的剧集排序遵循相同的并发一致性约束。
			await Promise.all([episode1.updateSort(1), episode2.updateSort(2)]);
			expect(await episode1.sort).toBe(1);
			expect(await episode2.sort).toBe(2);
			// 测试文件内容更新
			await episode.updateTitle('测试1');
			await series.getDataInstance().save();
			const dataEpisode = await getJsonFIle();
			const expectEpisodeId = await episode.id;
			const seasonData = dataEpisode[0].seasons.find((item: any) => item.id === expectSeasonId);
			expect(seasonData?.episodes.find((item: any) => item.id === expectEpisodeId)?.title).toBe('测试1');

			// 非视频文件不能被错误地登记为剧集，新增的视频文件则必须能被扫描到。
			const temporaryVideoPath = path.join(dir, '视频1', '第一季', 'temporary.webm');
			const nonVideoPath = path.join(dir, '视频1', '第一季', 'metadata.txt');
			await Promise.all([fs.writeFile(temporaryVideoPath, ''), fs.writeFile(nonVideoPath, '')]);
			await Series.updateSeries(await series.id);
			const episodesWithTemporaryVideo = await Episode.getAllEpisodes(season);
			const temporaryEpisode = episodesWithTemporaryVideo.find(
				(item) => item.getEpisodeName() === path.basename(temporaryVideoPath),
			);
			expect(temporaryEpisode).toBeDefined();
			expect(
				episodesWithTemporaryVideo.some((item) => item.getEpisodeName() === path.basename(nonVideoPath)),
			).toBe(false);

			// 刷新会对账静态缓存；已删除的视频不能再通过旧 ID 被取回。
			const temporaryEpisodeId = await temporaryEpisode!.id;
			await fs.unlink(temporaryVideoPath);
			await Series.updateSeries(await series.id);
			await expect(Series.getEpisodeById(temporaryEpisodeId)).rejects.toThrow();
			await fs.unlink(nonVideoPath);
		} catch (error) {
			throw error;
		} finally {
			try {
				await fs.unlink(testImagePath1);
				await fs.unlink(testImagePath2);
				await fs.rm(path.join(dir, '视频1', '第一季', 'temporary.webm'), { force: true });
				await fs.rm(path.join(dir, '视频1', '第一季', 'metadata.txt'), { force: true });
			} catch (error) {}
		}
	});
});
