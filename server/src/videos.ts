import type { Series, Season, Episode } from '~types/videos';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { allowedImageExtensions, allowedVideoExtensions } from '@config/server';

const configPrefix = process.env.VIDEO_CONFIG_PREFIX || '';
const configName = configPrefix + '.video.json';

async function isDirectory(path: string) {
	try {
		return (await fs.stat(path)).isDirectory();
	} catch (error) {
		return false;
	}
}

async function isFile(path: string) {
	try {
		return (await fs.stat(path)).isFile();
	} catch (error) {
		return false;
	}
}

function isAllowVideoExtension(extension: string) {
	return allowedVideoExtensions.includes(extension);
}

function isAllowImageExtension(extension: string) {
	return allowedImageExtensions.includes(extension);
}

function hash(str: string) {
	return crypto.createHash('md5').update(str).digest('hex');
}

async function getDirectoryFile() {
	const configPath = path.resolve(process.cwd(), configName);
	try {
		await fs.access(configPath);
	} catch (error) {
		await fs.writeFile(configPath, JSON.stringify([], null, 2));
	}
	return configPath;
}

/**
 * 获取所有视频系列目录
 * @returns 视频系列目录数组
 */
export async function getDirectories(): Promise<string[]> {
	const configPath = await getDirectoryFile();
	return JSON.parse(await fs.readFile(configPath, 'utf-8'));
}

/**
 * 检查目录是否被允许，所有视频、图片资源文件目录必须在允许的目录中
 *
 * @param directory 视频系列目录
 * @returns 是否被允许
 */
export async function isAllowedDirectory(directory: string) {
	const directories = await getDirectories();
	const handleDirectory = path.resolve(directory);
	return directories.find((item) => {
		return handleDirectory.startsWith(item);
	});
}

/**
 * 设置视频系列目录
 * @param directories 视频系列目录数组
 */
export async function setDirectories(...directories: string[]) {
	const configPath = await getDirectoryFile();
	const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
	config.push(...directories.map((item) => path.resolve(item)).filter((item) => !config.includes(item)));
	await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * 删除视频系列目录
 * @param directories 视频系列目录数组
 */
export async function removeDirectories(...directories: string[]) {
	const configPath = await getDirectoryFile();
	const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as string[];
	const newConfig = config.filter((item) => !directories.includes(item));
	await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
}

/**
 * 每个视频的总根目录下添加配置文件，存储该视频系列的描述信息和关键词等信息
 */
async function getSeriesDirectoryFile(directory: string) {
	const configPath = path.resolve(directory, configName);
	try {
		await fs.access(configPath);
	} catch (error) {
		await fs.writeFile(configPath, JSON.stringify([], null, 2));
	}
	return configPath;
}

/**
 * 获取所有视频系列的信息
 * @returns 视频系列信息数组
 */
export async function getSeriesInfos() {
	const directories = await getDirectories();
	const result: Series[] = [];
	for (const directory of directories) {
		const configPath = await getSeriesDirectoryFile(directory);
		const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
		result.push(...config);
	}
	return result;
}

/**
 * 刷新视频系列信息，遍历每个视频系列的目录内容，判断是否有更新，并将更新后的信息写入配置文件
 */
export async function refreshSeriesInfo() {
	const directories = await getDirectories();
	const oldInfos = await getSeriesInfos();
	for (const directory of directories) {
		if (!isDirectory(directory)) {
			continue;
		}

		const configPath = await getSeriesDirectoryFile(directory);

		/**
		 * 遍历每个视频系列的目录内容，判断是否有更新，并将更新后的信息写入配置文件
		 * @returns 更新后的视频系列信息数组
		 */
		const traverseSeries = async () => {
			const datas: Series[] = [];
			const files = await fs.readdir(directory);
			const filter: Set<string> = new Set();
			for (const file of files) {
				const seriesPath = path.resolve(directory, file);
				if (!isDirectory(seriesPath)) {
					continue;
				}

				filter.add(file);
				const oldSerieInfo = oldInfos.find((item) => item.name === file) || ({} as Series);
				const seasonInfo = await traverseSeasons(seriesPath, oldSerieInfo);
				if (seasonInfo.seasons.length) {
					// 合并旧信息
					datas.push({
						id: hash(seriesPath),
						rootPath: seriesPath,
						name: file,
						title: oldSerieInfo.title || file,
						images: seasonInfo.images || [],
						seasons: seasonInfo.seasons,
						description: oldSerieInfo.description || '',
						tags: oldSerieInfo.tags || [],
					});
				}
			}

			return datas.filter((item) => filter.has(item.name));
		};

		/**
		 * 遍历视频系列的目录内容，判断是否有更新，并将更新后的信息写入配置文件
		 * @param seriesPath 视频系列目录
		 * @param oldSerieInfo 旧的视频系列信息
		 * @returns 更新后的视频系列信息
		 */
		const traverseSeasons = async (seriesPath: string, oldSerieInfo: Series) => {
			const oldSeasons = oldSerieInfo.seasons || [];
			const wait: string[] = [];
			const files = await fs.readdir(seriesPath);
			const result = {
				images: oldSerieInfo.images || [],
				seasons: oldSeasons,
			};
			const seasonFilter: Set<string> = new Set();
			const episodeFilter: Set<string> = new Set();

			/**
			 * 过滤视频系列的季信息，根据视频文件路径过滤出需要更新的季信息
			 * @param pathName 季的路径名
			 */
			const filterEpisode = (pathName: string) => {
				const target = result.seasons.find((item) => item.pathName === pathName);
				if (target) {
					target.episodes = target.episodes.filter((item) => episodeFilter.has(item.pathName));
				}
				episodeFilter.clear();
			};

			/**
			 * 初始化视频系列的季信息，根据视频文件路径过滤出需要更新的季信息
			 * @param pathName 季的路径名
			 * @param title 季的标题
			 * @returns 季的视频文件数组
			 */
			const initialSeason = (pathName: string, title: string) => {
				seasonFilter.add(pathName);
				const target = result.seasons.find((item) => item.pathName === pathName);
				// 不存在旧数据则新插入一条，索引取最大值
				if (!target) {
					const episodes = [] as Episode[];
					const season = {
						id: hash(path.resolve(seriesPath, pathName)),
						seasonNumber: Math.max(0, ...result.seasons.map((item) => item.seasonNumber)) + 1,
						pathName,
						title,
						episodes,
					} as Season;
					result.seasons.push(season);
					return episodes;
				}
				return target.episodes;
			};

			for (const file of files) {
				const seasonPath = path.resolve(seriesPath, file);
				if (await isDirectory(seasonPath)) {
					wait.push(seasonPath);
					continue;
				}
				// 先遍历文件，判断是否有视频文件，如果有则同样整理为季信息
				const extension = path.extname(seasonPath);
				if (isAllowImageExtension(extension)) {
					if (!result.images.includes(file)) {
						result.images.push(file);
					}
					continue;
				}
				if (isAllowVideoExtension(extension)) {
					episodeFilter.add(traverseEpisodes(seasonPath, initialSeason('/', '未命名')));
				}
			}

			if (episodeFilter.size) {
				filterEpisode('/');
			}

			for (const folder of wait) {
				const episodesFolderPath = path.resolve(seriesPath, folder);
				const files = await fs.readdir(episodesFolderPath);
				if (!files.length) {
					continue;
				}
				const basename = path.basename(folder);
				const episodes = initialSeason(basename, basename);
				// 遍历视频文件
				for (const file of files) {
					const episodePath = path.resolve(episodesFolderPath, file);
					if (!isFile(episodePath)) {
						continue;
					}
					const extension = path.extname(episodePath);
					if (isAllowVideoExtension(extension)) {
						episodeFilter.add(traverseEpisodes(episodePath, episodes));
					}
				}
				if (episodeFilter.size) {
					filterEpisode(basename);
				}
			}

			result.seasons = result.seasons.filter((item) => seasonFilter.has(item.pathName));

			return result;
		};

		/**
		 * 遍历视频系列的集信息目录内容，判断是否有更新，并将更新后的信息写入配置文件
		 * @param episodePath 视频文件路径
		 * @param episodes 继承自旧数据的集信息
		 */
		const traverseEpisodes = (episodePath: string, episodes: Episode[]) => {
			const extension = path.extname(episodePath);
			const filename = path.basename(episodePath, extension);
			const basename = path.basename(episodePath);
			const target = episodes.find((item) => item.pathName === basename);
			if (!target) {
				episodes.push({
					id: hash(episodePath),
					episodeNumber: Math.max(0, ...episodes.map((item) => item.episodeNumber)) + 1,
					pathName: basename,
					extension,
					title: filename,
				} as Episode);
			}
			return basename;
		};

		const datas = await traverseSeries();

		await fs.writeFile(configPath, JSON.stringify(datas, null, 2), 'utf-8');
	}
}
