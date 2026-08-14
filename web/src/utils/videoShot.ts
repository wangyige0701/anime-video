import { createPromise } from '@wang-yige/utils';

export function takeVideoShotToClipboard(video?: HTMLVideoElement | null) {
	const { promise, resolve, reject } = createPromise<void>();
	if (!video) {
		reject('video is required');
		return promise;
	}
	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		reject('canvas context is required');
		return promise;
	}
	ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
	canvas.toBlob((blob) => {
		if (!blob) {
			return reject('blob is required');
		}
		navigator.clipboard
			.write([
				new ClipboardItem({
					'image/png': blob,
				}),
			])
			.then(() => {
				resolve();
			})
			.catch((err) => {
				reject(err);
			});
	});
	return promise;
}
