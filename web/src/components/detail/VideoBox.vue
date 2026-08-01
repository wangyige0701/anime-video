<template>
	<div class="video-box" :class="{ transition: status.transition, show: status.show, hide: !status.show }">
		<div ref="container" class="video-container" :style="{ height: containerHeight + 'px' }"></div>
	</div>
</template>

<script setup lang="ts">
import { videoEmitter, type VideoEvents } from '@/events/video-data';
import { delay } from '@wang-yige/utils';
import { useEventListener, useResizeObserver } from '@vueuse/core';

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

const status = useVueStatusRef('show', 'transition');
const container = useTemplateRef('container');
const containerHeight = ref(0);

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
	status.onShow();
	status.onTransition();
	await delay(props.transitionDuration);
	status.offTransition();
	emit('show');
}

async function hide() {
	if (!status.show) {
		return;
	}
	emit('beforeHide');
	status.offShow();
	status.onTransition();
	await delay(props.transitionDuration * 0.66);
	status.offTransition();
	emit('hide');
}

async function openAndPlay(data: VideoEvents['video']) {
	setVideo(data);
	await show();
	play();
}

function setVideo(data: VideoEvents['video']) {
	videoEmitter.emit('video', data);
}

function play() {
	videoEmitter.emit('play');
}

function pause() {
	videoEmitter.emit('pause');
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
	&,
	.video-container {
		animation-duration: var(--transition-duration);
		animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
		animation-fill-mode: forwards;
		animation-play-state: paused;
	}
	&.transition {
		&,
		.video-container {
			animation-play-state: running;
		}
	}
	&.show {
		display: flex;
		&.transition {
			.video-container {
				animation-name: container-show;
			}
			animation-name: box-show;
		}
	}
	&.hide {
		&:not(.transition) {
			display: none;
			z-index: -999;
		}
		&.transition {
			.video-container {
				animation-name: container-hide;
			}
			animation-name: box-hide;
		}
	}
}

.video-container {
	width: 80%;
	max-width: 1200px;
	border-radius: 15px;
	background-color: map.get(token.$theme, 'video-bg');
	box-shadow: map.get(token.$theme, 'video-shadow');
}

@keyframes box-show {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
@keyframes box-hide {
	from {
		opacity: 1;
	}
	to {
		opacity: 0;
	}
}
@keyframes container-show {
	from {
		transform: translateY(5%);
	}
	to {
		transform: translateY(0);
	}
}
@keyframes container-hide {
	from {
		transform: translateY(0);
	}
	to {
		transform: translateY(5%);
	}
}
</style>
