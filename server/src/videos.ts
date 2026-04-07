import path from 'node:path';
import fs, { stat } from 'node:fs';

/**
 * 视频系列
 */
interface Series {
	rootPath: string;
	name: string;
	title: string;
	images: string[];
	seasons: Season[];
	/**
	 * 可手动添加的描述信息
	 */
	description: string;
	/**
	 * 可手动添加的关键词
	 */
	tags: string[];
}

/**
 * 季
 */
interface Season {
	seasonNumber: number;
	pathName: string;
	title: string;
	episodes: Episode[];
}

/**
 * 集
 */
interface Episode {
	episodeNumber: number;
	pathName: string;
	extension: string;
	title: string;
}

const configPrefix = process.env.VIDEO_CONFIG_PREFIX || '';
const configName = configPrefix + '.video.json';
const videoExtensions = ['.mp4', '.mkv'];
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

function getDirectoryFile() {
	const configPath = path.resolve(process.cwd(), configName);
	if (!fs.existsSync(configPath)) {
		fs.writeFileSync(configPath, JSON.stringify([], null, 2));
	}
	return configPath;
}

export function getDirectories(): string[] {
	const configPath = getDirectoryFile();
	return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function setDirectories(...directories: string[]) {
	const configPath = getDirectoryFile();
	const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
	config.push(...directories.map((item) => path.resolve(item)).filter((item) => !config.includes(item)));
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * 每个视频的总根目录下添加配置文件，存储该视频系列的描述信息和关键词等信息
 */
function getSeriesDirectoryFile(directory: string) {
	const configPath = path.resolve(directory, configName);
	if (!fs.existsSync(configPath)) {
		fs.writeFileSync(configPath, JSON.stringify([], null, 2));
	}
	return configPath;
}

export function getSeriesInfos() {
	const directories = getDirectories();
	const result: Series[] = [];
	for (const directory of directories) {
		const configPath = getSeriesDirectoryFile(directory);
		const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		result.push(config);
	}
	return result;
}

export function refreshSeriesInfo() {
	const directories = getDirectories();
	const oldInfos = getSeriesInfos();
	for (const directory of directories) {
		if (!isDirectory(directory)) {
			continue;
		}

		const configPath = getSeriesDirectoryFile(directory);

		// 遍历每个视频系列的目录内容
		const traverseSeries = () => {
			const datas: Series[] = [];
			const files = fs.readdirSync(directory);
			const filter: Set<string> = new Set();
			for (const file of files) {
				const seriesPath = path.resolve(directory, file);
				if (!isDirectory(seriesPath)) {
					continue;
				}

				filter.add(file);
				const oldSerieInfo = oldInfos.find((item) => item.name === file) || ({} as Series);
				const seasonInfo = traverseSeasons(seriesPath, oldSerieInfo);
				if (seasonInfo.seasons.length) {
					// 合并旧信息
					datas.push({
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

		const traverseSeasons = (seriesPath: string, oldSerieInfo: Series) => {
			const oldSeasons = oldSerieInfo.seasons || [];

			const wait: string[] = [];
			const files = fs.readdirSync(seriesPath);
			const result = {
				images: oldSerieInfo.images || [],
				seasons: oldSeasons,
			};
			const seasonFilter: Set<string> = new Set();
			const episodeFilter: Set<string> = new Set();

			const filterEpisode = (pathName: string) => {
				const target = result.seasons.find((item) => item.pathName === pathName);
				if (target) {
					target.episodes = target.episodes.filter((item) => episodeFilter.has(item.pathName));
				}
				episodeFilter.clear();
			};

			const initialSeason = (pathName: string, title: string) => {
				seasonFilter.add(pathName);
				const target = result.seasons.find((item) => item.pathName === pathName);
				// 不存在旧数据则新插入一条，索引取最大值
				if (!target) {
					const episodes = [] as Episode[];
					const season = {
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
				if (isDirectory(seasonPath)) {
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
				const files = fs.readdirSync(episodesFolderPath);
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
					episodeNumber: Math.max(0, ...episodes.map((item) => item.episodeNumber)) + 1,
					pathName: basename,
					extension,
					title: filename,
				} as Episode);
			}
			return basename;
		};

		const datas = traverseSeries();

		fs.writeFileSync(configPath, JSON.stringify(datas, null, 2), 'utf-8');
	}
}

function isDirectory(path: string) {
	return fs.existsSync(path) && fs.statSync(path).isDirectory();
}

function isFile(path: string) {
	return fs.existsSync(path) && fs.statSync(path).isFile();
}

function isAllowVideoExtension(extension: string) {
	return videoExtensions.includes(extension);
}

function isAllowImageExtension(extension: string) {
	return imageExtensions.includes(extension);
}
