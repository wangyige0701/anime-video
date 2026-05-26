import { Fn } from '@wang-yige/utils';

/**
 * 视频系列
 */
export interface Series {
	id: string;
	rootPath: string;
	/**
	 * 视频系列目录名，不可修改
	 */
	name: string;
	/**
	 * 视频系列标题，默认为系列目录名称，可手动修改
	 */
	title: string;
	/**
	 * 视频系列图片路径数组，默认为空，可手动添加
	 */
	images: string[];
	/**
	 * 视频系列季数组
	 */
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
	id: string;
	seasonNumber: number;
	pathName: string;
	title: string;
	episodes: Episode[];
}

/**
 * 集
 */
export interface Episode {
	id: string;
	episodeNumber: number;
	pathName: string;
	extension: string;
	title: string;
}

export type ServerToPromise<T extends Object> = {
	[K in keyof T]: Promise<T[K]>;
};
