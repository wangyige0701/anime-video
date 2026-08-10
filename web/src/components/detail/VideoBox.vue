<template>
	<Transition name="box" :duration="transitionDuration" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
		<div v-if="status.show" class="video-box">
			<div ref="container" class="video-container" :style="{ height: containerHeight + 'px' }">
				<VideoCore />
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core';
import VideoCore from '@/video/VideoCore.vue';
import { usePlayerStore } from '@/stores/player';
import type { VideoPlayData } from '@/@types/video';

const props = withDefaults(
	defineProps<{
		/**
		 * 过渡时间，单位毫秒
		 */
		transitionDuration?: number;
	}>(),
	{
		transitionDuration: 300,
	},
);
const emit = defineEmits<{
	(e: 'beforeShow'): void;
	(e: 'show'): void;
	(e: 'beforeHide'): void;
	(e: 'hide'): void;
}>();

const status = useVueStatusRef('show');
const playerStore = usePlayerStore();
const container = useTemplateRef('container');
const containerHeight = ref(0);
let resolveTransition: (() => void) | undefined;

useResizeObserver(container, (enteries) => {
	const target = enteries[0];
	if (!target) {
		return;
	}
	const rect = target.contentRect;
	containerHeight.value = Number(((rect.width * 9) / 16).toFixed(2));
});

useEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		event.preventDefault();
		hide();
	}
});

async function show() {
	if (status.show) {
		return;
	}
	emit('beforeShow');
	const transitionFinished = waitForTransition();
	status.onShow();
	await transitionFinished;
}

async function hide() {
	if (!status.show) {
		return;
	}
	emit('beforeHide');
	const transitionFinished = waitForTransition();
	status.offShow();
	await transitionFinished;
}

function waitForTransition() {
	return new Promise<void>((resolve) => {
		resolveTransition = resolve;
	});
}

function onAfterEnter() {
	emit('show');
	resolveTransition?.();
	resolveTransition = undefined;
}

function onAfterLeave() {
	emit('hide');
	resolveTransition?.();
	resolveTransition = undefined;
}

async function openAndPlay(data: VideoPlayData) {
	setVideo(data);
	await show();
	play();
}

function setVideo(data: VideoPlayData) {
	playerStore.setVideo(data);
}

function play() {
	playerStore.play();
}

function pause() {
	playerStore.pause();
}

defineExpose({
	show,
	hide,
	openAndPlay,
	setVideo,
	play,
	pause,
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-box {
	--transition-duration: calc(v-bind('props.transitionDuration') * 1ms);
	display: flex;
	justify-content: center;
	align-items: center;
	position: fixed;
	inset: 0;
	z-index: 100;
	background-color: map.get(token.$theme, 'video-mask-bg');
	backdrop-filter: blur(1px);
}

.video-container {
	width: 80%;
	max-width: 1200px;
	border-radius: 15px;
	background-color: map.get(token.$theme, 'video-bg');
	box-shadow: map.get(token.$theme, 'video-shadow');
	overflow: hidden;
}

.box-enter-active,
.box-leave-active {
	transition: opacity var(--transition-duration) cubic-bezier(0.2, 0.8, 0.2, 1);
	.video-container {
		transition: transform var(--transition-duration) cubic-bezier(0.2, 0.8, 0.2, 1);
	}
}

.box-enter-from,
.box-leave-to {
	opacity: 0;
	.video-container {
		transform: scale(0.96) translateY(5%);
	}
}
</style>
