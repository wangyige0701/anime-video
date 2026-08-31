import { useDebounceFn } from '@vueuse/core';
import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { PreviewImage } from './useHlsImagePreview';

type TimelinePreviewOptions = {
	getPreviewImage: () => ((time: number) => Promise<PreviewImage>) | undefined;
	source: MaybeRefOrGetter<unknown>;
	enabled: MaybeRefOrGetter<boolean>;
	debounce?: number;
};

export function useTimelinePreview(options: TimelinePreviewOptions) {
	const previewSrc = ref<string>();
	const previewLoading = ref(false);
	let previewRange: { startTime: number; endTime: number } | undefined;
	let latestHoverTime: number | undefined;
	let queuedPreviewTime: number | undefined;
	let isRequestRunning = false;
	let sourceVersion = 0;

	const requestDebounced = useDebounceFn(queueRequest, options.debounce ?? 250);

	watch(
		() => [toValue(options.source), toValue(options.enabled)],
		() => reset(),
		{ flush: 'sync' },
	);
	onScopeDispose(reset);

	function handleHoverTime(time: number) {
		if (!toValue(options.enabled) || !Number.isFinite(time) || time < 0) {
			return;
		}
		latestHoverTime = time;
		if (!isRequestRunning && isTimeInPreviewRange(time)) {
			queuedPreviewTime = undefined;
			requestDebounced.cancel();
			previewLoading.value = false;
			return;
		}
		previewLoading.value = true;
		requestDebounced(time);
	}

	function handleHoverEnd() {
		requestDebounced.cancel();
		queuedPreviewTime = undefined;
		latestHoverTime = undefined;
		previewLoading.value = false;
	}

	function queueRequest(time: number) {
		queuedPreviewTime = time;
		void flushRequest();
	}

	async function flushRequest() {
		if (isRequestRunning) {
			return;
		}
		isRequestRunning = true;
		try {
			while (queuedPreviewTime !== undefined) {
				const time = queuedPreviewTime;
				const requestSourceVersion = sourceVersion;
				queuedPreviewTime = undefined;
				try {
					const getPreviewImage = options.getPreviewImage();
					if (!getPreviewImage) {
						throw new Error('播放器未就绪');
					}
					const preview = await getPreviewImage(time);
					if (requestSourceVersion !== sourceVersion) {
						continue;
					}
					previewRange = {
						startTime: preview.previewStartTime,
						endTime: preview.previewEndTime,
					};
					previewSrc.value = preview.src;
					if (latestHoverTime !== undefined && isTimeInPreviewRange(latestHoverTime)) {
						queuedPreviewTime = undefined;
						previewLoading.value = false;
					}
				} catch {
					if (requestSourceVersion === sourceVersion && queuedPreviewTime === undefined) {
						previewRange = undefined;
						previewSrc.value = undefined;
						previewLoading.value = false;
					}
				}
			}
		} finally {
			isRequestRunning = false;
			if (queuedPreviewTime !== undefined) {
				void flushRequest();
			}
		}
	}

	function isTimeInPreviewRange(time: number) {
		return Boolean(previewRange && time >= previewRange.startTime && time < previewRange.endTime);
	}

	function reset() {
		sourceVersion++;
		requestDebounced.cancel();
		queuedPreviewTime = undefined;
		latestHoverTime = undefined;
		previewRange = undefined;
		previewSrc.value = undefined;
		previewLoading.value = false;
	}

	return {
		previewSrc,
		previewLoading,
		handleHoverTime,
		handleHoverEnd,
		reset,
	};
}
