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
	/**
	 * 已并入当前系列（作为主系列）的其它系列 id 数组，默认为空。
	 *
	 * 合并关系只记录在主系列上，被合并系列自身不保存反向引用，避免两处数据不同步。
	 * 数组顺序即叠层顺序，也是详情页季分组的拼接顺序。
	 *
	 * 约束：一个系列要么是主系列（持有合并成员），要么是某个主系列的成员，不能同时成立，
	 * 也不允许链式合并，因此成员系列自身的该字段恒为空数组。
	 */
	mergedIds: string[];
}

/**
 * 系列摘要，不含季与集。
 *
 * 列表页与合并接口只需要系列自身字段，季与集按需单独请求。
 */
export type SeriesSummary = Omit<Series, 'seasons'>;

/**
 * 合并或脱离后的返回结果。
 *
 * `main` 是合并后的主系列；`member` 仅合并时有值，是被并入的系列（其自身的合并成员已被展平转移）。
 */
export interface SeriesMergeResult {
	main: SeriesSummary;
	member?: SeriesSummary;
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
