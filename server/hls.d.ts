declare module '~hls/hls.node' {
	class Hls {
		public static configure(options: {
			/**
			 * 全局 TS 调度器并发数
			 */
			globalSegmentConcurrency?: number;
		}): void;

		/**
		 * 创建 Hls 实例
		 * @param inputPath 输入文件路径
		 * @param segmentMinDuration 片段最短时长，单位秒
		 */
		constructor(
			inputPath: string,
			options?: {
				contextPoolSize?: number;
				segmentMinDuration?: number;
				mediaM3u8Name?: string;
				subtitleM3u8Name?: string;
				imageM3u8Name?: string;
				/** 独立预览图工作线程的最大数量，默认 1 */
				imageMaxConcurrency?: number;
				/** 预览图输出画布宽度，单位像素，必须是正偶数，默认 320 */
				imageOutputWidth?: number;
				/** 预览图输出画布高度，单位像素，必须是正偶数，默认 180 */
				imageOutputHeight?: number;
				/** 单个预览图 fMP4 分片最大字节数，默认 50 KiB */
				imageMaxSegmentBytes?: number;
				/** 单个预览图 JPEG payload 最大字节数，默认 46 KiB */
				imageMaxJpegBytes?: number;
				/** 原生预览图 LRU 缓存最大字节数，默认 8 MiB */
				imageMaxCacheBytes?: number;
				onLog?: (level: 'info' | 'error' | 'debug' | 'warn', msg: string) => void;
			},
		);

		/**
		 * 获取主 m3u8 文件
		 */
		master(): Buffer;

		/**
		 * 获取视频 m3u8 文件
		 */
		media_m3u8(): Buffer;

		/**
		 * 获取视频分片文件（.ts）
		 * @param index 分片索引
		 */
		ts(index: number): Promise<Buffer>;

		/**
		 * 获取字幕 m3u8 文件
		 * @param streamIndex 流索引
		 */
		subtitle_m3u8(streamIndex: number): Buffer;

		/**
		 * 获取字幕分片文件（.vtt）
		 * @param streamIndex 流索引
		 * @param index 分片索引
		 */
		subtitle(streamIndex: number, index: number): Buffer;

		/** 获取 JPEG I-frame 图片轨道 m3u8 */
		image_m3u8(): Buffer;

		/** 获取 JPEG I-frame fMP4 初始化段 */
		image_init(): Buffer;

		/** 按现有 HLS 分片序号生成单帧 JPEG fMP4 */
		image(index: number): Promise<Buffer>;

		/**
		 * 获取 Hls 实例分片数量
		 */
		size(): number;

		/**
		 * 销毁 Hls 实例
		 */
		destroy(): void;
	}
}
