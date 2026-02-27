<template>
	<div class="video-container">
		<div class="video-player">
			<Player ref="player"></Player>
		</div>
		<div class="video-process">
			<Process></Process>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef, watchEffect } from 'vue';
import Player from './Player.vue';
import Process from './Process.vue';
import { useVideoStore } from '@/stores/video';

const player = useTemplateRef('player');

watchEffect(() => {
	console.log(useVideoStore().process);
});

onMounted(async () => {
	const name =
		'E:\\动画\\我们不可能成为恋人！绝对不行。 (※似乎可行？)\\正片\\11.mp4';
	const time = await fetch(
		`http://localhost:3000/video/${encodeURIComponent(name)}/info`,
	).then((res) => res.json());
	const src = `http://localhost:3000/video/${encodeURIComponent(name)}`;
	if (player.value) {
		player.value.setVideo(src, '视频', time.data);

		player.value.play();
	}
});
</script>

<style scoped lang="scss">
.video-container {
	width: 960px;
	height: 540px;
}

.video-player {
	width: 100%;
	height: 100%;
	background-color: black;
}
</style>
