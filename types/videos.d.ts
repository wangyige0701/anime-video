/**
 * 视频系列
 */
export interface Series {
	id: string;
	/**
	 * 视频系列根目录路径
	 */
	path: string;
	/**
	 * 视频系列目录名，不可修改
	 */
	name: string;
	/**
	 * 视频系列标题，默认为系列目录名称，可手动修改
	 */
	title: string;
	/**
	 * 视频系列图片路径数组，默认为空，可手动添加。
	 *
	 * 存储数据结构如下：
	 * - path 图片路径，存储时只存储文件名（包含扩展名），解析时会手动拼接完整路径
	 * - sort 图片排序, 从 1 开始
	 *
	 * 读取时自动解析为图片完整路径的数组
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
	 * 视频系列日期，默认为空，可手动添加。
	 */
	date: [year?: number, month?: number];
	/**
	 * 视频系列类型数组，默认为空，可手动添加。
	 */
	types: number[];
	/**
	 * 视频系列状态，默认为 0，即没有设置状态。
	 */
	status: number;
}

export type SeriesImagesStoreStruct = Array<{
	/**
	 * 图片路径，储存时只记录文件名（包含扩展名）
	 */
	path: string;
	sort: number;
}>;

/**
 * 季
 */
export interface Season {
	id: string;
	/**
	 * 季排序, 从 1 开始
	 */
	sort: number;
	/**
	 * 季目录路径，存储时只存储目录名，解析时会手动拼接完整路径
	 */
	path: string;
	/**
	 * 季标题，默认为季文件名，可手动修改
	 */
	title: string;
	episodes: Episode[];
}

/**
 * 集
 */
export interface Episode {
	id: string;
	/**
	 * 集排序, 从 1 开始
	 */
	sort: number;
	/**
	 * 集文件路径，存储时只存储文件名（包含扩展名），解析时会手动拼接完整路径
	 */
	path: string;
	/**
	 * 集文件扩展名
	 */
	extension: string;
	/**
	 * 集标题，默认为集文件名(不包含扩展名)，可手动修改
	 */
	title: string;
}

/**
 * 服务端属性转为 Promise 类型
 */
export type ServerToPromise<T extends Object> = {
	[K in keyof T]: Promise<T[K]>;
};
