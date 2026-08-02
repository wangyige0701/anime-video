<template>
	<div class="video-core" @click="clickContainer">
		<div class="video-player">
			<VideoPlayer ref="player"></VideoPlayer>
		</div>
		<div class="video-progress">
			<VideoProgress></VideoProgress>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoPlayer from './VideoPlayer.vue';
import VideoProgress from './VideoProgress.vue';

const player = useTemplateRef('player');

function clickContainer() {
	if (player.value && player.value instanceof HTMLVideoElement) {
		if (player.value.isPlay) {
			player.value.pause();
		} else {
			player.value.play();
		}
	}
}
</script>

<style scoped lang="scss">
.video-core,
.video-player {
	width: 100%;
	height: 100%;
}
</style>
