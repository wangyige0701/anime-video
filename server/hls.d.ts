declare module '@hls/hls.node' {
	class Hls {
		/**
		 * 创建 Hls 实例
		 * @param inputPath 输入文件路径
		 * @param segmentMinDuration 片段最短时长，单位秒
		 */
		constructor(
			inputPath: string,
			segmentMinDuration?: number,
			options?: {
				mediaM3u8Name?: string;
				subtitleM3u8Name?: string;
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
