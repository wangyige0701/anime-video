<template>
	<div ref="videoTimelineRef" class="video-timeline">
		<div
			ref="track"
			class="track"
			@mousemove="handleTrackMouseMove"
			@mouseleave="status.offMouseEnter()"
			@click.stop="handleTrackClick"
		>
			<div class="line">
				<div class="loaded"></div>
				<div class="runway"></div>
			</div>
			<div class="bar-wrap" :class="{ dragging: status.dragging }">
				<div class="bar" data-timeline-slider @pointerdown.stop="startDragging" @click.stop></div>
			</div>
			<el-tooltip
				ref="tooltip"
				:content="formatDuration(mouseTime)"
				:show-arrow="false"
				:append-to="videoTimelineRef || void 0"
				placement="top"
				:offset="20"
				:hide-after="0"
				:visible="status.mouseEnter || status.dragging"
				:fallback-placements="['top']"
				:popper-options="tooltipPopperOptions"
				:virtual-ref="virtualTrigger"
				virtual-triggering
			></el-tooltip>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import { formatDuration } from '@/utils/duration';
import { useDebounceFn, useEventListener } from '@vueuse/core';
import type { Measurable } from 'element-plus';

const emit = defineEmits<{
	(e: 'dragging', value: boolean): void;
}>();

let isSyncCurrentTime = true;
let tooltipFrame: number | null = null;
const videoTimelineRef = useTemplateRef('videoTimelineRef');
const track = useTemplateRef('track');
const tooltip = useTemplateRef('tooltip');
const status = useVueStatusRef('mouseEnter', 'dragging');
const playerStore = usePlayerStore();
const currentTime = ref(playerStore.currentTime);
const mouseTime = ref(0);
const mousePosition = { x: 0, y: 0 };
const virtualTrigger: Measurable = {
	getBoundingClientRect: () => new DOMRect(mousePosition.x, mousePosition.y),
};
const tooltipPopperOptions = {
	strategy: 'fixed' as const,
	modifiers: [{ name: 'preventOverflow', options: { mainAxis: false } }],
};
const loadedRatio = computed(() => getRatio(playerStore.loaded));
const runwayRatio = computed(() => getRatio(currentTime.value));

watch(
	() => playerStore.currentTime,
	(newTime) => {
		if (isSyncCurrentTime) {
			currentTime.value = newTime;
		}
	},
	{ flush: 'sync' },
);

watch(
	() => status.dragging,
	(value) => emit('dragging', value),
	{ immediate: true, flush: 'sync' },
);

useEventListener(window, 'pointermove', updateDragging);
useEventListener(window, 'pointerup', stopDragging);
useEventListener(window, 'pointercancel', stopDragging);
useEventListener(window, 'blur', () => stopDragging());

onBeforeUnmount(() => {
	if (tooltipFrame !== null) {
		cancelAnimationFrame(tooltipFrame);
	}
});

const setCurrentTimeDebounce = useDebounceFn(async (time: number) => {
	playerStore.setCurrentTime(time);
	await nextTick();
	playerStore.play();
	isSyncCurrentTime = true;
}, 500);

function setCurrentTime(time: number) {
	isSyncCurrentTime = false;
	currentTime.value = time;
	playerStore.pause();
	setCurrentTimeDebounce(time);
}

function getRatio(time: number) {
	const duration = playerStore.duration;
	const ratio = duration > 0 && Number.isFinite(duration) ? time / duration : 0;
	return `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
}

function getPointerTime(event: MouseEvent | PointerEvent) {
	if (!track.value) {
		return null;
	}
	const rect = track.value.getBoundingClientRect();
	if (rect.width <= 0) {
		return null;
	}
	const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
	if (status.dragging) {
		mousePosition.x = event.clientX;
	} else {
		mousePosition.x = rect.left + ratio * rect.width;
	}
	mousePosition.y = rect.bottom;
	updateTooltipPosition();
	if (!Number.isFinite(playerStore.duration) || playerStore.duration <= 0) {
		return null;
	}
	const time = ratio * playerStore.duration;
	mouseTime.value = time;
	return time;
}

function updateTooltipPosition() {
	if (tooltipFrame !== null) {
		return;
	}
	tooltipFrame = requestAnimationFrame(() => {
		tooltipFrame = null;
		tooltip.value?.updatePopper();
	});
}

function handleTrackMouseMove(event: MouseEvent) {
	status.onMouseEnter();
	getPointerTime(event);
}

function handleTrackClick(event: MouseEvent) {
	if (event.target instanceof Element && event.target.closest('[data-timeline-slider]')) {
		return;
	}
	const time = getPointerTime(event);
	if (time !== null) {
		setCurrentTime(time);
	}
}

function startDragging(event: PointerEvent) {
	if (event.button !== 0) {
		return;
	}
	event.preventDefault();
	status.onDragging();
	updateDragging(event);
}

function updateDragging(event: PointerEvent) {
	if (!status.dragging) {
		return;
	}
	const time = getPointerTime(event);
	if (time !== null) {
		setCurrentTime(time);
	}
}

function stopDragging(event?: PointerEvent) {
	if (!status.dragging) {
		return;
	}
	if (event?.type === 'pointerup') {
		updateDragging(event);
	}
	status.offDragging();
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-timeline {
	--bar-height: 12px;
	--bar-width: 24px;
	--progress-sale: 2;

	@mixin bar-active {
		transform: translate(-50%, -50%) scale(1, calc(1 / var(--progress-sale)));
		opacity: 1;
	}
	@mixin bar-hover {
		background-color: map.get(token.$theme, 'video-timeline-runway-bg');
		outline-color: rgba(#fff, 0.92);
		box-shadow:
			0 0 0 4px rgba(#fff, 0.18),
			0 2px 8px rgba(#000, 0.32);
	}

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
		transition: transform 0.3s ease;
		transform-origin: bottom center;
		position: relative;
		&:hover {
			transform: scaleY(var(--progress-sale));
			.line {
				border-radius: calc(var(--progress-height) * var(--progress-sale) / 2) /
					calc(var(--progress-height) / 2);
			}
			.bar,
			.bar-wrap.dragging .bar {
				@include bar-active;
			}
		}
		.line {
			width: 100%;
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-bg');
			position: relative;
			border-radius: calc(var(--progress-height) / 2);
			transition: border-radius 0.3s ease;
			overflow: hidden;
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
			&.dragging {
				.bar {
					@include bar-active;
					@include bar-hover;
					transform: translate(-50%, -50%);
				}
			}
		}
		.bar {
			width: 100%;
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-bar-color');
			border-radius: 4px;
			outline: 2px solid transparent;
			transform: translate(-50%, -50%) scale(0, 0);
			transform-origin: center center;
			opacity: 0;
			transition:
				transform 0.3s ease,
				opacity 0.3s ease,
				background-color 0.2s ease,
				outline-color 0.2s ease,
				outline-width 0.2s ease,
				box-shadow 0.2s ease;
			&:hover {
				@include bar-hover;
			}
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
