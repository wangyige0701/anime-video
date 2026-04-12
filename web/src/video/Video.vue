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
