/**
 * HLS 播放能力探测。
 *
 * `hls.js` 体积接近 600KB，而 `stores/player.ts` 会被应用入口（`main.ts`）引用，
 * 一旦在顶层 `import Hls from 'hls.js'`，整个播放器库就会被卷进首屏产物，
 * 首屏要等这 600KB 下载并解析完成才能渲染列表。
 *
 * 这里按 `hls.js` 内部 `isSupported()` 的判定逻辑复刻一份轻量实现，
 * 让入口只做能力探测；真正的播放器实例仍然由详情页的 `VideoPlayer.vue` 按需引入。
 *
 * 判定与 `hls.js` 保持一致：
 * 1. 存在 `MediaSource`（或 Safari 的 `ManagedMediaSource`）；
 * 2. `SourceBuffer` 暴露时其原型必须实现 `appendBuffer` 与 `remove`；
 * 3. 至少有一种音视频编码被 `MediaSource.isTypeSupported()` 支持。
 */

type MediaSourceLike = {
	prototype?: {
		isTypeSupported?: (type: string) => boolean;
		appendBuffer?: unknown;
		remove?: unknown;
	};
	isTypeSupported?: (type: string) => boolean;
};

/** 视频编码候选，任一项可用即认为支持 MSE 播放 */
const VIDEO_CODECS = ['avc1.42E01E,mp4a.40.2', 'av01.0.01M.08', 'vp09.00.50.08'];

/** 音频编码候选，任一项可用即认为支持 MSE 播放 */
const AUDIO_CODECS = ['mp4a.40.2', 'fLaC'];

/**
 * 读取当前环境的 `MediaSource` 构造器。
 *
 * 每次调用都重新读取，便于单元测试替换全局对象；
 * 优先使用标准 `MediaSource`，Safari 上回退到 `ManagedMediaSource`。
 */
function getMediaSource(): MediaSourceLike | null {
	if (typeof self === 'undefined') {
		return null;
	}
	const scope = self as unknown as {
		MediaSource?: MediaSourceLike;
		ManagedMediaSource?: MediaSourceLike;
	};
	return scope.MediaSource ?? scope.ManagedMediaSource ?? null;
}

/**
 * 读取当前环境的 `SourceBuffer` 构造器。
 *
 * 老版本浏览器不会在全局暴露 `SourceBuffer`，此时返回 `null` 视为跳过原型校验。
 */
function getSourceBuffer(): { prototype?: Record<string, unknown> } | null {
	if (typeof self === 'undefined') {
		return null;
	}
	const scope = self as unknown as {
		SourceBuffer?: { prototype?: Record<string, unknown> };
		WebKitSourceBuffer?: { prototype?: Record<string, unknown> };
	};
	return scope.SourceBuffer ?? scope.WebKitSourceBuffer ?? null;
}

/** 拼接 `MediaSource.isTypeSupported()` 需要的 MIME 字符串 */
function mimeTypeForCodec(codec: string, type: 'video' | 'audio') {
	return `${type}/mp4;codecs="${codec}"`;
}

/**
 * 当前环境是否支持 Media Source Extensions。
 *
 * 只判断基础能力，不涉及具体编码，可用于区分「浏览器太老」与「编码不支持」。
 */
export function isMSESupported(): boolean {
	const mediaSource = getMediaSource();
	if (!mediaSource) {
		return false;
	}
	const sourceBuffer = getSourceBuffer();
	if (!sourceBuffer) {
		return true;
	}
	const prototype = sourceBuffer.prototype;
	return (
		Boolean(prototype) && typeof prototype?.appendBuffer === 'function' && typeof prototype?.remove === 'function'
	);
}

/**
 * 当前环境能否使用 `hls.js` 播放视频。
 *
 * 与 `Hls.isSupported()` 结果一致，但不引入 `hls.js`。
 */
export function isHlsSupported(): boolean {
	if (!isMSESupported()) {
		return false;
	}
	const mediaSource = getMediaSource();
	if (typeof mediaSource?.isTypeSupported !== 'function') {
		return false;
	}
	const check = mediaSource.isTypeSupported.bind(mediaSource);
	return (
		VIDEO_CODECS.some((codec) => check(mimeTypeForCodec(codec, 'video'))) ||
		AUDIO_CODECS.some((codec) => check(mimeTypeForCodec(codec, 'audio')))
	);
}
