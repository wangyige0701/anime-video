import Hls, { type ErrorData, type HlsImageIFramesOnly } from 'hls.js';
import { onScopeDispose } from 'vue';

export type PreviewImage = HTMLImageElement & {
	previewStartTime: number;
	previewEndTime: number;
};

type HlsImagePreviewOptions = {
	getHls: () => Hls | null;
	getDuration: () => number | undefined;
	getSourceVersion: () => number;
	initialized: Promise<void>;
};

export function useHlsImagePreview(options: HlsImagePreviewOptions) {
	let imageHls: HlsImageIFramesOnly | null = null;
	let previewQueue: Promise<void> = Promise.resolve();
	let cancelPreviewLoad: ((reason: Error) => void) | null = null;
	let previewVersion = 0;

	function reset() {
		previewVersion++;
		cancelPreviewLoad?.(new Error('预览图请求已取消'));
		cancelPreviewLoad = null;
		imageHls?.detachImage();
		imageHls = null;
	}

	function getPreviewImage(time: number) {
		const requestSourceVersion = options.getSourceVersion();
		const requestPreviewVersion = previewVersion;
		const request = previewQueue.then(async () => {
			await options.initialized;
			const hls = options.getHls();
			if (
				!hls ||
				requestSourceVersion !== options.getSourceVersion() ||
				requestPreviewVersion !== previewVersion
			) {
				throw new Error('预览图请求已过期');
			}

			const imagePlayer = imageHls || hls.createImageIFramePlayer();
			if (!imagePlayer) {
				throw new Error('预览图轨道尚未就绪');
			}
			imageHls = imagePlayer;

			const duration = options.getDuration();
			const previewTime = Number.isFinite(duration)
				? Math.min(normalizeTime(time), Math.max((duration as number) - 0.001, 0))
				: normalizeTime(time);
			const image = document.createElement('img') as PreviewImage;
			image.decoding = 'async';

			return await new Promise<PreviewImage>((resolve, reject) => {
				let settled = false;
				const finish = (error?: Error) => {
					if (settled) {
						return;
					}
					settled = true;
					image.removeEventListener('load', handleLoad);
					image.removeEventListener('error', handleImageError);
					imagePlayer.off(Hls.Events.ERROR, handleHlsError);
					cancelPreviewLoad = null;
					if (error) {
						reject(error);
					}
				};
				const handleLoad = () => {
					const fragment = imagePlayer.levels
						.flatMap((level) => level.details?.fragments || [])
						.find((item) => previewTime >= item.start && previewTime < item.end);
					image.previewStartTime = fragment?.start ?? previewTime;
					image.previewEndTime = fragment?.end ?? previewTime + 0.001;
					finish();
					resolve(image);
				};
				const handleImageError = () => finish(new Error('预览图加载失败'));
				const handleHlsError = (_event: string, data: ErrorData) => finish(data.error);

				cancelPreviewLoad = finish;
				image.addEventListener('load', handleLoad, { once: true });
				image.addEventListener('error', handleImageError, { once: true });
				imagePlayer.on(Hls.Events.ERROR, handleHlsError);
				imagePlayer.attachImage(image);
				imagePlayer.loadMediaAt(previewTime);
			});
		});

		previewQueue = request.then(
			() => undefined,
			() => undefined,
		);
		return request;
	}

	onScopeDispose(reset);

	return { getPreviewImage, reset };
}

function normalizeTime(time: number) {
	return Number.isFinite(time) ? Math.max(time, 0) : 0;
}
