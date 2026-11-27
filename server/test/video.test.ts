import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { Series } from '~server/data/series';
import { Season } from '~server/data/season';
import { Episode } from '~server/data/episode';
import { Data } from '~server/data/data';
import { NotFoundError } from '~server/src/error/notFound';

const SERVER = __APP_CONFIG__.server;
const DATA_FILE = SERVER.videoConfigPrefix + SERVER.dataFile;

describe('Video Data Config', () => {
	const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './videos');
	const configPath = path.join(process.cwd(), DATA_FILE);
	const dataPath = path.resolve(dir, DATA_FILE);

	// 夹具中的 mp4 占位文件和「第一季」目录都不会进 git（`*.mp4` 被忽略、目录无法单独跟踪），
	// 这里在用例开始前补齐，结束后只清理本次新建的部分，保证干净检出也能跑通。
	const seasonFixtureDirectory = path.join(dir, '视频1', '第一季');
	const seasonFixtures = ['1.mp4', '2.mp4', '3.mp4'].map((name) => path.join(seasonFixtureDirectory, name));
	const createdFixtures: string[] = [];
	let createdDirectory = false;

	beforeAll(async () => {
		try {
			await fs.access(seasonFixtureDirectory);
		} catch {
			await fs.mkdir(seasonFixtureDirectory, { recursive: true });
			createdDirectory = true;
		}
		for (const file of seasonFixtures) {
			try {
				await fs.access(file);
			} catch {
				await fs.writeFile(file, '');
				createdFixtures.push(file);
			}
		}
	});

	afterAll(async () => {
		await Promise.all(createdFixtures.map((file) => fs.rm(file, { force: true })));
		if (createdDirectory) {
			// 目录非空时删除会失败，说明另有内容残留，保留现场即可（`rm` 删目录需要 recursive）。
			await fs.rmdir(seasonFixtureDirectory).catch(() => {});
		}
	});

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

	it('Should recover the latest valid data from a temporary file', async () => {
		const tempPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-recovery.test.video.json');
		const tempFilePath = `${tempPath}.tmp`;
		try {
			await fs.writeFile(tempPath, JSON.stringify({ value: 'current' }));
			await fs.writeFile(tempFilePath, JSON.stringify({ value: 'stale' }));
			const data = new Data(tempPath, { value: 'default' });
			expect(await data.read()).toEqual({ value: 'stale' });
			expect(await fs.readFile(tempPath, 'utf-8')).toBe(JSON.stringify({ value: 'stale' }));
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

	it('Should preserve the data file when the temporary file is invalid', async () => {
		const tempPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'data-invalid-tmp-preserve.test.video.json',
		);
		const tempFilePath = `${tempPath}.tmp`;
		try {
			await fs.writeFile(tempPath, JSON.stringify({ value: 'current' }));
			await fs.writeFile(tempFilePath, '{invalid json');
			const data = new Data(tempPath, { value: 'default' });
			expect(await data.read()).toEqual({ value: 'current' });
			expect(await fs.readFile(tempPath, 'utf-8')).toBe(JSON.stringify({ value: 'current' }));
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

			// 类型追加与移除：追加是幂等的，重复提交同一批类型不会写出重复项。
			await series.addTypes([2, 3]);
			expect(await series.types).toEqual([1, 2, 3]);
			await series.addTypes([3, 3]);
			expect(await series.types).toEqual([1, 2, 3]);
			await series.removeTypes([3]);
			expect(await series.types).toEqual([1, 2]);

			// 标题传空（含纯空白）表示恢复默认标题，即系列目录名。
			await series.updateTitle('   ');
			expect(await series.title).toBe('视频1');
			await series.updateTitle('测试视频标题');

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
			// 追加接口幂等：重复提交已存在的图片（含同一批次内的重复项）不新增记录
			await series.addImages([path.basename(testImagePath1), path.basename(testImagePath1)]);
			await series.getDataInstance().save();
			const dataWithImageAgain = await getJsonFIle();
			expect(dataWithImageAgain[0].images).toEqual(dataWithImage1[0].images);

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
			// 配置数组顺序与 sort 不一致时（历史数据），移除图片仍按 sort 重编号，
			// 否则剩余图片的展示顺序会退化成配置文件里的数组顺序。
			const configWithImages = await series.getConfig();
			configWithImages.images.reverse();
			await series.removeImages([path.basename(testImagePath1)]);
			expect(configWithImages.images).toEqual([
				{ path: path.basename(originImagePath2), sort: 1 },
				{ path: path.basename(originImagePath1), sort: 2 },
			]);
			await fs.unlink(testImagePath1);
			await series.getDataInstance().save();

			const season1 = new Season('第一季', series);
			// 移动到第 3 位会被夹到末位：第一季 sort 2，第二季 sort 1。
			await season1.updateSort(3);
			await series.getDataInstance().save();
			const season2 = new Season('第二季', series);
			const seasons = await series.seasons;
			await series.getDataInstance().save();
			// 季列表按 sort 升序返回，第一季被移动到末位后顺序为 [第二季, 第一季]。
			expect(await Promise.all(seasons.map((item) => item.id))).toEqual([await season2.id, await season1.id]);
			const season = seasons[1]!;
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

			// 季标题为空时恢复默认标题，即季目录名。
			await season.updateTitle('');
			expect(await season.title).toBe('第一季');
			await season.updateTitle('测试第一季');

			const episode1 = new Episode('1.mp4', season);
			const episode3 = new Episode('3.mp4', season);
			// 移动到第 2 位：1.mp4 sort 2，2.mp4 sort 1。
			await episode1.updateSort(2);
			const episode2 = new Episode('2.mp4', season);
			const episodes = await season.episodes;
			// 剧集列表同样按 sort 升序返回，顺序为 [2.mp4, 1.mp4, 3.mp4]。
			expect(await Promise.all(episodes.map((item) => item.id))).toEqual([
				await episode2.id,
				await episode1.id,
				await episode3.id,
			]);
			const episode = episodes[1]!;
			expect(await episode.id).toBe(await episode1.id);
			expect(await episode.id).toBe(Series.hash(await episode.path));
			expect(await episode.path).toBe(path.resolve(dataPath, '..', '视频1', '第一季', '1.mp4'));
			expect(await episode.sort).toBe(2);
			expect(await episode2.sort).toBe(1);
			expect(await episode.title).toBe('1');
			// DTO 出口由字段表派生，键集合与顺序必须与接口契约一致。
			const episodeDetail = await episode.getValue();
			expect(Object.keys(episodeDetail)).toEqual(['id', 'sort', 'path', 'extension', 'title']);
			const seasonDetail = await season.getValue();
			expect(Object.keys(seasonDetail)).toEqual(['id', 'sort', 'path', 'title', 'episodes']);
			expect(Object.keys(seasonDetail.episodes[0]!)).toEqual(['id', 'sort', 'path', 'extension', 'title']);
			const seriesSummary = await series.getValueOmitSeasons();
			expect(Object.keys(seriesSummary)).toEqual([
				'id',
				'path',
				'name',
				'title',
				'images',
				'description',
				'date',
				'types',
				'status',
			]);
			const seriesDetail = await series.getValue();
			expect(Object.keys(seriesDetail)).toEqual([
				'id',
				'path',
				'name',
				'title',
				'images',
				'description',
				'date',
				'types',
				'status',
				'seasons',
			]);

			// DTO 必须输出派生后的值，而不是配置文件里的原始结构：
			// 图片是排序后的绝对路径数组，季/集 path 是绝对路径。
			// 这里断言类型与取值而不只是键集合，否则「图片退化成 { path, sort } 对象」不会被发现。
			expect(seriesDetail.images).toEqual(await series.images);
			expect(seriesSummary.images).toEqual(await series.images);
			expect(seriesDetail.images.every((image) => typeof image === 'string' && path.isAbsolute(image))).toBe(
				true,
			);
			expect(seasonDetail.path).toBe(await season.path);
			expect(path.isAbsolute(seasonDetail.path)).toBe(true);
			expect(episodeDetail.path).toBe(await episode.path);
			expect(path.isAbsolute(episodeDetail.path)).toBe(true);
			// 同一季中的剧集排序遵循相同的并发一致性约束。
			await Promise.all([episode1.updateSort(1), episode2.updateSort(2)]);
			expect(await episode1.sort).toBe(1);
			expect(await episode2.sort).toBe(2);

			// 整体重写排序：传入的 id 顺序就是最终顺序，内部重编号 1..N；
			// 未列出的集追加在末尾，不会因为调用方漏传而从顺序里消失。
			await season.rewriteEpisodeOrder([await episode3.id, await episode1.id]);
			expect(await episode3.sort).toBe(1);
			expect(await episode1.sort).toBe(2);
			expect(await episode2.sort).toBe(3);
			const rewrittenEpisodes = await season.episodes;
			expect(await Promise.all(rewrittenEpisodes.map((item) => item.id))).toEqual([
				await episode3.id,
				await episode1.id,
				await episode2.id,
			]);
			// 落库值与内存顺序必须一致，否则刷新页面会回到旧顺序。
			await series.getDataInstance().save();
			const dataRewritten = await getJsonFIle();
			const rewrittenSeasonData = dataRewritten[0].seasons.find((item: any) => item.id === expectSeasonId);
			expect(
				rewrittenSeasonData?.episodes
					.slice()
					.sort((a: any, b: any) => a.sort - b.sort)
					.map((item: any) => [item.path, item.sort]),
			).toEqual([
				['3.mp4', 1],
				['1.mp4', 2],
				['2.mp4', 3],
			]);

			// 非法入参整次拒绝：重复 id、不属于本季的 id 都抛错，且不产生半截写入。
			await expect(season.rewriteEpisodeOrder([await episode1.id, await episode1.id])).rejects.toThrow(/重复/);
			await expect(season.rewriteEpisodeOrder(['not-exist'])).rejects.toThrow(/不属于/);
			expect(await episode3.sort).toBe(1);
			expect(await episode1.sort).toBe(2);
			expect(await episode2.sort).toBe(3);

			// 恢复到文件名顺序，后续断言按 1、2、3 推导。
			await season.rewriteEpisodeOrder([await episode1.id, await episode2.id, await episode3.id]);
			expect(await episode1.sort).toBe(1);
			expect(await episode2.sort).toBe(2);
			expect(await episode3.sort).toBe(3);
			// 测试文件内容更新
			await episode.updateTitle('测试1');
			await series.getDataInstance().save();
			const dataEpisode = await getJsonFIle();
			const expectEpisodeId = await episode.id;
			const seasonData = dataEpisode[0].seasons.find((item: any) => item.id === expectSeasonId);
			expect(seasonData?.episodes.find((item: any) => item.id === expectEpisodeId)?.title).toBe('测试1');

			// 集标题为空时恢复默认标题，即文件名去掉扩展名。
			await episode.updateTitle('  ');
			expect(await episode.title).toBe('1');
			await episode.updateTitle('测试1');

			// 非视频文件不能被错误地登记为剧集，新增的视频文件则必须能被扫描到。
			const temporaryVideoPath = path.join(dir, '视频1', '第一季', 'temporary.webm');
			const nonVideoPath = path.join(dir, '视频1', '第一季', 'metadata.txt');
			await Promise.all([fs.writeFile(temporaryVideoPath, ''), fs.writeFile(nonVideoPath, '')]);
			await Series.updateSeries(await series.id);
			expect(await series.images).toEqual([originImagePath2, originImagePath1]);
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

	it('Should discover images added after an initially empty series is refreshed', async () => {
		const seriesName = '刷新图片测试';
		const seriesDirectory = path.join(dir, seriesName);
		const imagePath = path.join(seriesDirectory, 'cover.png');

		try {
			await fs.rm(seriesDirectory, { recursive: true, force: true });
			await fs.mkdir(seriesDirectory);
			await Series.clearCache();
			await Series.setDirectories(dir);

			const series = (await Series.getAllSeries()).find((item) => item.getSeriesName() === seriesName)!;
			expect(await series.images).toEqual([]);

			await fs.writeFile(imagePath, '');
			await Series.updateSeries(await series.id);

			expect(await series.images).toEqual([imagePath]);
			const data = await getJsonFIle();
			const seriesId = await series.id;
			expect(data.find((item: any) => item.id === seriesId)?.images).toEqual([
				{ path: path.basename(imagePath), sort: 1 },
			]);
		} finally {
			await fs.rm(seriesDirectory, { recursive: true, force: true });
			await Series.updateSeries();
			await Series.clearCache();
		}
	});

	it('Should map a missing video resource to a not-found error', async () => {
		await expect(Series.getSeriesById('not-found')).rejects.toBeInstanceOf(NotFoundError);
	});
});
