export interface AppConfig {
	/** Koa API 服务配置 */
	server: {
		/** 服务协议 */
		protocol: string;
		/** 监听地址及对外访问主机名 */
		host: string;
		/** API 服务端口 */
		port: number;
		/** 配置文件名前缀 */
		videoConfigPrefix: string;
		/** 视频数据索引文件名 */
		dataFile: string;
		/** 允许作为系列图片的文件扩展名 */
		allowedImageExtensions: string[];
		/** 允许作为视频的文件扩展名 */
		allowedVideoExtensions: string[];
		/** 数据文件保存防抖延迟（毫秒） */
		dataFileSaveDelay: number;
	};

	/** 日志落盘与缓冲配置 */
	logging: {
		/** 日志根目录 */
		directory: string;
		/** 是否启用文件落盘 */
		fileEnabled: boolean;
		/** 单个日志文件最大字节数 */
		fileMaxBytes: number;
		/** 日志保留天数 */
		retentionDays: number;
		/** transport 内存缓冲大小 */
		bufferBytes: number;
		/** 缓冲最长等待时间（毫秒） */
		flushIntervalMs: number;
	};

	/** Web 静态文件及开发代理服务配置 */
	web: {
		/** Web 服务协议 */
		protocol: string;
		/** Web 服务主机名 */
		host: string;
		/** Web 服务端口 */
		port: number;
		/** Vite 开发服务器端口 */
		devWebPort: number;
		/** Web 静态资源目录 */
		webBundleDir: string;
	};

	/** HLS 播放列表、分片及预览图配置 */
	hls: {
		/** 各类 m3u8 播放列表的文件名（不含扩展名） */
		masterM3u8Name: string;
		mediaM3u8Name: string;
		subtitleM3u8Name: string;
		imageM3u8Name: string;
		/** 全局 HLS 分片任务并发数 */
		globalSegmentConcurrency: number;
		/** 视频分片的最短时长（秒） */
		segmentMinDuration: number;
		/** HLS 转码上下文池大小 */
		contextPoolSize: number;
		/** 预览图生成的最大并发数 */
		imageMaxConcurrency: number;
		/** 预览图输出尺寸（像素） */
		imageOutputWidth: number;
		imageOutputHeight: number;
		/** 单个预览图分片的最大大小（字节） */
		imageMaxSegmentBytes: number;
		/** 单张 JPEG 预览图的最大大小（字节） */
		imageMaxJpegBytes: number;
		/** 预览图缓存的最大总大小（字节） */
		imageMaxCacheBytes: number;
	};
}
