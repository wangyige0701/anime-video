<template>
	<div class="video-timeline">
		<div class="track">
			<div class="loaded"></div>
			<div class="runway"></div>
			<div class="bar-wrap">
				<div class="bar"></div>
			</div>
			<el-tooltip
				:content="formatDuration(currentTime)"
				:show-arrow="false"
				placement="top"
				:offset="20"
				:disabled="!isMouseEnter"
			>
				<div class="mouse"></div>
			</el-tooltip>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import { formatDuration } from '@/utils/duration';
import { useDebounceFn } from '@vueuse/core';

let isSyncCurrentTime = true;
const playerStore = usePlayerStore();
const isMouseEnter = ref(false);
const currentTime = ref(playerStore.currentTime);
const loadedRatio = computed(() => playerStore.loaded / playerStore.duration);
const runwayRatio = computed(() => playerStore.currentTime / playerStore.duration);

watch(
	() => playerStore.currentTime,
	(newTime) => {
		if (isSyncCurrentTime) {
			currentTime.value = newTime;
		}
	},
	{ flush: 'sync' },
);

const setCurrentTimeDebounce = useDebounceFn(async (time: number) => {
	playerStore.setCurrentTime(time);
	await nextTick();
	playerStore.play();
	isSyncCurrentTime = true;
}, 500);

function setCurrentTime(time: number) {
	playerStore.pause();
	isSyncCurrentTime = false;
	currentTime.value = time;
	setCurrentTimeDebounce(time);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-timeline {
	--bar-height: 12px;
	--bar-width: 24px;
	--progress-sale: 2;
	width: 100%;
	height: calc(var(--progress-height) * var(--progress-sale));
	display: flex;
	flex-direction: row;
	align-items: flex-end;
	justify-content: center;
	background-color: transparent;
	.track {
		cursor: pointer;
		width: calc(100% - var(--bar-width) - 2px);
		height: var(--progress-height);
		background-color: map.get(token.$theme, 'video-timeline-bg');
		transition: transform 0.3s ease;
		transform-origin: bottom center;
		position: relative;
		&:hover {
			transform: scaleY(var(--progress-sale));
			.bar {
				transform: translate(-50%, -50%) scale(1, calc(1 / var(--progress-sale)));
				opacity: 1;
			}
		}
		.loaded {
			width: v-bind('loadedRatio');
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-loaded-bg');
		}
		.runway {
			width: v-bind('runwayRatio');
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-runway-bg');
		}
		.bar-wrap {
			width: var(--bar-width);
			height: var(--bar-height);
			position: absolute;
			top: 50%;
			left: v-bind('runwayRatio');
		}
		.bar {
			width: 100%;
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-bar-color');
			border-radius: 4px;
			transform: translate(-50%, -50%) scale(0, 0);
			transform-origin: center center;
			opacity: 0;
			transition:
				transform 0.3s ease,
				opacity 0.3s ease;
		}
		.loaded,
		.runway {
			position: absolute;
			top: 0;
			left: 0;
		}
	}
}
</style>
