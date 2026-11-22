import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHlsSupported, isMSESupported } from '../../web/src/utils/hls-support';

type MediaSourceStub = {
	isTypeSupported?: (type: string) => boolean;
};

/**
 * 构造一个可播放指定编码的 `MediaSource` 桩对象。
 *
 * 只匹配完整的「容器 + codes」片段，避免视频 MIME 里内嵌的音频编码被误判。
 *
 * @param supported 支持的编码列表（如 `avc1.42E01E,mp4a.40.2`），命中即返回 true
 */
function createMediaSource(supported: string[]): MediaSourceStub {
	return {
		isTypeSupported: (type: string) => supported.some((codec) => type.includes(`/mp4;codecs="${codec}"`)),
	};
}

/**
 * 覆盖全局 `self`，模拟浏览器环境的媒体能力。
 *
 * @param value 需要挂到 `self` 上的属性，`undefined` 表示环境里没有 `self`
 */
function stubSelf(value: Record<string, unknown> | undefined) {
	vi.stubGlobal('self', value);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('isMSESupported', () => {
	it('没有 self 时视为不支持', () => {
		stubSelf(undefined);
		expect(isMSESupported()).toBe(false);
	});

	it('没有 MediaSource 时视为不支持', () => {
		stubSelf({});
		expect(isMSESupported()).toBe(false);
	});

	it('只有 MediaSource 没有 SourceBuffer 时视为支持', () => {
		stubSelf({ MediaSource: createMediaSource(['avc1']) });
		expect(isMSESupported()).toBe(true);
	});

	it('支持 ManagementMediaSource 回退', () => {
		stubSelf({ ManagedMediaSource: createMediaSource(['avc1']) });
		expect(isMSESupported()).toBe(true);
	});

	it('SourceBuffer 原型缺少 appendBuffer 时视为不支持', () => {
		stubSelf({
			MediaSource: createMediaSource(['avc1']),
			SourceBuffer: { prototype: { remove() {} } },
		});
		expect(isMSESupported()).toBe(false);
	});

	it('SourceBuffer 原型完整时视为支持', () => {
		stubSelf({
			MediaSource: createMediaSource(['avc1']),
			SourceBuffer: { prototype: { appendBuffer() {}, remove() {} } },
		});
		expect(isMSESupported()).toBe(true);
	});
});

describe('isHlsSupported', () => {
	it('没有 MSE 能力时不支持', () => {
		stubSelf({});
		expect(isHlsSupported()).toBe(false);
	});

	it('缺少 isTypeSupported 时不支持', () => {
		stubSelf({ MediaSource: {} });
		expect(isHlsSupported()).toBe(false);
	});

	it('支持 H.264 视频编码时可用', () => {
		stubSelf({ MediaSource: createMediaSource(['avc1.42E01E,mp4a.40.2']) });
		expect(isHlsSupported()).toBe(true);
	});

	it('支持 AV1 视频编码时可用', () => {
		stubSelf({ MediaSource: createMediaSource(['av01.0.01M.08']) });
		expect(isHlsSupported()).toBe(true);
	});

	it('仅支持音频编码时可用', () => {
		stubSelf({ MediaSource: createMediaSource(['mp4a.40.2']) });
		expect(isHlsSupported()).toBe(true);
	});

	it('所有候选编码都不支持时不可用', () => {
		stubSelf({ MediaSource: createMediaSource([]) });
		expect(isHlsSupported()).toBe(false);
	});
});
