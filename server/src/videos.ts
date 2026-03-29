import path from 'node:path';
import fs, { stat } from 'node:fs';

/**
 * 视频系列
 */
interface Series {
	rootPath: string;
	name: string;
	title: string; // 可修改，默认是 name
	imagePath: string;
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

		const datas: Series[] = [];
		const configPath = getSeriesDirectoryFile(directory);

		// 遍历每个视频系列的目录内容
		const traverseSeries = () => {
			const files = fs.readdirSync(directory);
			for (const file of files) {
				const seriesPath = path.resolve(directory, file);
				if (!isDirectory(seriesPath)) {
					continue;
				}

				const oldSerieInfo = oldInfos.find((item) => item.name === file) || ({} as Series);
				const seasonInfo = traverseSeasons(seriesPath, oldSerieInfo);
				if (seasonInfo.seasons.length) {
					// 合并旧信息
					datas.push({
						rootPath: directory,
						name: file,
						title: oldSerieInfo.title || file,
						imagePath: seasonInfo.image || '',
						seasons: seasonInfo.seasons,
						description: oldSerieInfo.description || '',
						tags: oldSerieInfo.tags || [],
					});
				}
			}
		};

		const traverseSeasons = (seriesPath: string, oldSerieInfo: Series) => {
			const oldSeasons = oldSerieInfo.seasons || [];

			const wait: string[] = [];
			const files = fs.readdirSync(seriesPath);
			const result = {
				image: '',
				seasons: oldSeasons,
			};

			const initialSeason = (pathName: string, title: string) => {
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
					result.image = seasonPath;
					continue;
				}
				if (isAllowVideoExtension(extension)) {
					traverseEpisodes(seasonPath, initialSeason('/', '未命名'));
				}
			}

			for (const folder of wait) {
				const episodesFolderPath = path.resolve(seriesPath, folder);
				const files = fs.readdirSync(episodesFolderPath);
				if (!files.length) {
					continue;
				}
				const episodes = initialSeason(folder, folder);
				// 遍历视频文件
				for (const file of files) {
					const episodePath = path.resolve(episodesFolderPath, file);
					if (!isFile(episodePath)) {
						continue;
					}
					const extension = path.extname(episodePath);
					if (isAllowVideoExtension(extension)) {
						traverseEpisodes(episodePath, episodes);
					}
				}
			}
			return result;
		};

		/**
		 * @param episodePath 视频文件路径
		 * @param episodes 继承自旧数据的集信息
		 */
		const traverseEpisodes = (episodePath: string, episodes: Episode[]) => {
			const extension = path.extname(episodePath);
			const fileName = path.basename(episodePath, extension);
			const target = episodes.find((item) => item.pathName === fileName);
			if (!target) {
				episodes.push({
					episodeNumber: Math.max(0, ...episodes.map((item) => item.episodeNumber)) + 1,
					pathName: fileName,
					extension,
					title: fileName,
				} as Episode);
			}
		};

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
