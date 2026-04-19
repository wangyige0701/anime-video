/**
 * 视频系列
 */
export interface Series {
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
export interface Season {
	seasonNumber: number;
	pathName: string;
	title: string;
	episodes: Episode[];
}

/**
 * 集
 */
export interface Episode {
	episodeNumber: number;
	pathName: string;
	extension: string;
	title: string;
}
