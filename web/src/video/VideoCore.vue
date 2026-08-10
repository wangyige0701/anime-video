<template>
	<div class="video-core">
		<div class="video-player">
			<VideoPlayer></VideoPlayer>
		</div>
		<div class="video-progress">
			<VideoProgress></VideoProgress>
		</div>
		<div v-if="!playerStore.isPlaying" class="video-mask" @click.stop="playerStore.play()"></div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoPlayer from './VideoPlayer.vue';
import VideoProgress from './VideoProgress.vue';

const playerStore = usePlayerStore();
</script>

<style scoped lang="scss">
.video-core {
	width: 100%;
	height: 100%;
}

.video-core {
	position: relative;
}

.video-player,
.video-mask {
	position: absolute;
	inset: 0;
}

.video-mask {
	cursor: pointer;
}
</style>
