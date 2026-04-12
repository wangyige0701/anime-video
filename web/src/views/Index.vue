<template>
	<div style="height: 100%">
		<video ref="video" controls style="width: 950px; height: 540px"></video>

		<div class="switch">
			<button @click="switchVideo">切换视频</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import Hls from 'hls.js';

const video = useTemplateRef('video');
const mp4 = 'E:\\动画\\我们不可能成为恋人！绝对不行。 (※似乎可行？)\\正片\\11.mp4';
const mkv = 'E:\\迅雷下载\\mkv-test.mkv';
let name = mkv;
let hls: Hls | null = null;

function switchVideo() {
	if (hls) {
		name = name === mp4 ? mkv : mp4;
		hls.loadSource(`http://localhost:3000/video/${encodeURIComponent(name)}/master.m3u8`);
	}
}

onMounted(() => {
	const src = `http://localhost:3000/video/${encodeURIComponent(name)}/master.m3u8`;
	const el = video.value!;

	if (Hls.isSupported()) {
		hls = new Hls({
			maxBufferLength: 30, // 最多缓存 30 秒
			maxMaxBufferLength: 60, // 最大允许缓存
			maxBufferSize: 1024 * 1024 * 60, // 10MB 最大缓存大小
			lowLatencyMode: false,
			enableWebVTT: true,
		});

		hls.loadSource(src);
		hls.attachMedia(el);

		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			el.play();
		});

		hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function (event, data) {
			console.log(data.subtitleTracks);
		});
	} else if (el.canPlayType('application/vnd.apple.mpegurl')) {
		// Safari 原生支持 HLS
		el.src = src;
		el.addEventListener('loadedmetadata', () => {
			el.play();
		});
	} else {
		console.error('HLS not supported');
	}
});
</script>
