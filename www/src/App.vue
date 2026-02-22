<template>
	<video id="video" muted controls></video>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

onMounted(() => {
	const video: HTMLVideoElement = document.getElementById('video') as HTMLVideoElement;

	async function playFrom(t: number) {
		const name = 'E:\\动画\\我们不可能成为恋人！绝对不行。 (※似乎可行？)\\正片\\11.mp4'

		try {
			const time = await fetch(`http://localhost:3000/video/${encodeURIComponent(name)}/info`).then(res => res.json());
			console.log(`视频总时长: ${time.data}秒`);
		} catch (error) {
			console.error('获取视频信息失败:', error);
			return;
		}

		video.src = `http://localhost:3000/video/${encodeURIComponent(name)}?time=${t}`;

		video.load();
		video.play();
	}

	playFrom(0)
})
</script>

<style scoped>
#video {
	width: 500px;
	height: 300px;
}
</style>
