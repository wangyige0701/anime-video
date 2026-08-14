<template>
	<div class="video-core" ref="videoCoreRef">
		<div class="video-player">
			<VideoPlayer ref="videoPlayerRef" />
		</div>
		<div
			ref="videoMask"
			class="video-mask"
			:class="{ 'is-controller-active': playerStore.isControllerActive }"
			@click.stop="playerStore.togglePlay()"
		>
			<div class="video-title">
				<VideoTitle />
			</div>
			<div ref="videoController" class="video-controller">
				<VideoController
					@prev=""
					@next=""
					@fullscreen="videoCoreRef?.requestFullscreen()"
					@exit-fullscreen="exitFullscreen"
					@shot="videoPlayerRef?.shot()"
				/>
			</div>
			<div ref="closeButton" class="close" @click.stop="$emit('close')">
				<el-icon size="2rem">
					<CloseBold />
				</el-icon>
			</div>
			<div
				class="video-play-icon"
				:class="{ 'is-hidden': playerStore.isPlaying || playerStore.isLoading }"
				@click.stop="playerStore.togglePlay()"
			>
				<el-icon size="6rem">
					<PlayToggleIcon :play="!playerStore.isPlaying" />
				</el-icon>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoPlayer from './VideoPlayer.vue';
import VideoController from './VideoController.vue';
import VideoTitle from './VideoTitle.vue';
import { CloseBold } from '@element-plus/icons-vue';
import PlayToggleIcon from '@/components/icons/PlayToggleIcon.vue';
import { useVideoControllerActivity } from '@/utils/useVideoControllerActivity';

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const playerStore = usePlayerStore();
const videoCoreRef = useTemplateRef('videoCoreRef');
const videoMask = useTemplateRef('videoMask');
const videoPlayerRef = useTemplateRef('videoPlayerRef');
const videoController = useTemplateRef('videoController');
const closeButton = useTemplateRef('closeButton');

useVideoControllerActivity({
	container: videoMask,
	controller: videoController,
	persistentTargets: [closeButton],
	activate: playerStore.triggerControllerActive,
	hold: () => playerStore.clearControllerActiveTimeout(true),
	deactivate: playerStore.triggerControllerInactive,
});

function exitFullscreen() {
	document.exitFullscreen();
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-core {
	width: 100%;
	height: 100%;
	position: relative;
}

.video-player,
.video-mask {
	position: absolute;
	inset: 0;
}
.video-mask {
	cursor: pointer;
	z-index: 10;
	&.is-controller-active {
		.video-title,
		.video-controller,
		.close {
			opacity: 1;
		}
	}
}

.video-title,
.video-controller {
	cursor: default;
	width: 100%;
	position: absolute;
	opacity: 0;
	transition: opacity 0.3s ease;
	z-index: 2;
}
.video-title {
	top: 0;
	left: 0;
}
.video-controller {
	bottom: 0;
	left: 0;
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

.video-play-icon {
	pointer-events: none;
	position: absolute;
	top: 50%;
	left: 50%;
	color: map.get(token.$theme, 'l-9');
	transform: translate(-50%, -50%);
	transition:
		color 0.24s ease,
		transform 0.24s ease,
		opacity 0.24s ease;

	z-index: 20;
	&:hover {
		transform: translate(-50%, -50%) scale(1.06);
	}
	&.is-hidden {
		opacity: 0;
		transition-delay: 160ms;
	}
}
</style>
