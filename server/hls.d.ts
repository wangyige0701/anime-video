declare module '@hls/hls.node' {
	class Hls {
		/**
		 * 创建 Hls 实例
		 * @param inputPath 输入文件路径
		 * @param segmentDuration 片段最短时长，单位秒
		 */
		constructor(inputPath: string, segmentDuration?: number);

		m3u8(): Buffer;

		ts(index: number): Promise<Buffer>;

		size(): number;
	}
}
