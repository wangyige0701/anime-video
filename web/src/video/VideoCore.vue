<template>
	<div class="video-core">
		<div class="video-title">
			<VideoTitle />
		</div>
		<div class="video-player">
			<VideoPlayer />
		</div>
		<div class="video-controller">
			<VideoController />
		</div>
		<div v-if="!playerStore.isPlaying" class="video-mask" @click.stop="playerStore.play()"></div>
		<div class="close">
			<el-icon size="2rem" @click.stop="$emit('close')">
				<CloseBold />
			</el-icon>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoPlayer from './VideoPlayer.vue';
import VideoController from './VideoController.vue';
import VideoTitle from './VideoTitle.vue';
import { CloseBold } from '@element-plus/icons-vue';

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const playerStore = usePlayerStore();
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-core {
	width: 100%;
	height: 100%;
	position: relative;
	&:hover {
		.video-title,
		.close {
			opacity: 1;
		}
	}
}

.video-player,
.video-mask {
	position: absolute;
	inset: 0;
}

.video-title {
	width: 100%;
	position: absolute;
	top: 0;
	left: 0;
	opacity: 0;
	transition: opacity 0.3s ease;
	z-index: 2;
}

.video-mask {
	cursor: pointer;
	z-index: 10;
}

.close {
	cursor: pointer;
	color: map.get(token.$theme, 'l-9');
	position: absolute;
	top: 1rem;
	right: 1rem;
	opacity: 0;
	transition:
		opacity 0.3s ease,
		transform 0.2s ease-in-out;
	z-index: 20;
	&:hover {
		transform: scale(1.1);
	}
}
</style>
