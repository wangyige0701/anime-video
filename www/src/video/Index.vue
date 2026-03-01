<template>
	<div class="video-popup">
		<div class="video-container" @click="clickContainer">
			<div class="video-player">
				<Player ref="player"></Player>
			</div>
			<div class="video-progress">
				<Progress></Progress>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef, watchEffect } from 'vue';
import Player from './Player.vue';
import Progress from './Progress.vue';
import { useVideoStore } from '@/stores/video';

const player = useTemplateRef('player');

watchEffect(() => {
	console.log(useVideoStore().progress);
});

function clickContainer() {
	if (player.value) {
		if (player.value.isPlay) {
			player.value.pause();
		} else {
			player.value.play();
		}
	}
}

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
.video-popup {
	width: 100%;
	height: 100%;
	position: relative;
	background-color: rgba($color: #000000, $alpha: 0.5);
}

.video-container {
	width: 960px;
	height: 540px;
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
}

.video-player {
	pointer-events: none;
	width: 100%;
	height: 100%;
	background-color: black;
}

.video-progress {
	width: 100%;
	padding: 10px;
	position: absolute;
	left: 0;
	bottom: 0;
	background-color: rgba($color: #000000, $alpha: 0.5);
}
</style>
