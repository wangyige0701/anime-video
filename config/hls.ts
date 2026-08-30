export enum M3u8Config {
	MASTER_M3U8_NAME = 'master',
	MEDIA_M3U8_NAME = 'media',
	SUBTITLE_M3U8_NAME = 'subtitle',
	IMAGE_M3U8_NAME = 'image',
}

export const SEGMENT_MIN_DURATION = 4;

export const CONTEXT_POOL_SIZE = 4;

export const IMAGE_MAX_CONCURRENCY = 1;

export const IMAGE_OUTPUT_WIDTH = 320;

export const IMAGE_OUTPUT_HEIGHT = 180;

export const IMAGE_MAX_SEGMENT_BYTES = 50 * 1024;

export const IMAGE_MAX_JPEG_BYTES = 46 * 1024;

export const IMAGE_MAX_CACHE_BYTES = 8 * 1024 * 1024;
