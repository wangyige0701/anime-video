<template>
	<div ref="videoTimelineRef" class="video-timeline">
		<div
			ref="track"
			class="track"
			:class="{ 'in-track': status.mouseEnter || status.dragging }"
			@mouseenter="handleTrackMouseEnter"
			@mouseleave="handleTrackMouseLeave"
			@click.stop="handleTrackClick"
		>
			<div class="line">
				<div
					v-for="item in bufferRatios"
					:key="`buffer-${item[0]}`"
					class="buffer"
					:style="{ '--start': `${item[0]}`, '--end': `${item[1]}` }"
				></div>
				<div class="runway"></div>
			</div>
			<div class="bar-wrap" :class="{ dragging: status.dragging }">
				<div class="bar" data-timeline-slider @pointerdown.stop="startDragging" @click.stop></div>
			</div>
			<el-tooltip
				ref="tooltip"
				:show-arrow="false"
				:append-to="videoTimelineRef || void 0"
				placement="top"
				:offset="30"
				:hide-after="0"
				:visible="status.mouseEnter || status.dragging"
				:fallback-placements="['top']"
				:popper-options="tooltipPopperOptions"
				:virtual-ref="virtualTrigger"
				virtual-triggering
			>
				<template #content>
					<div class="timeline-tooltip" :class="{ 'is-time-only': !props.previewAvailable }">
						<div v-if="props.previewAvailable" class="timeline-tooltip__preview">
							<img
								v-if="props.previewSrc && !props.previewLoading"
								:src="props.previewSrc"
								alt=""
							/>
							<el-icon v-else size="4rem">
								<PlayerLoading />
							</el-icon>
						</div>
						<div class="timeline-tooltip__time">{{ formatDuration(mouseTime) }}</div>
					</div>
				</template>
			</el-tooltip>
		</div>
		<Transition name="pointer">
			<div
				v-if="status.mouseEnter || status.dragging"
				class="pointer"
				:class="{ enter: status.mouseEnter, dragging: status.dragging }"
				:style="{ '--x': `${pointerPosition}px` }"
			>
				<el-icon class="pointer__icon pointer__icon--top" size=".75rem">
					<Pointer direction="bottom" />
				</el-icon>
				<el-icon class="pointer__icon pointer__icon--bottom" size=".75rem">
					<Pointer />
				</el-icon>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import type { Measurable } from 'element-plus';
import { usePlayerStore } from '@/stores/player';
import { formatDuration } from '@/utils/duration';
import { useDebounceFn, useEventListener } from '@vueuse/core';

const props = defineProps<{
	previewSrc?: string;
	previewLoading?: boolean;
	previewAvailable?: boolean;
}>();

const emit = defineEmits<{
	(e: 'dragging', value: boolean): void;
	(e: 'hoverTime', time: number): void;
	(e: 'hoverEnd'): void;
}>();

let isSyncCurrentTime = true;
let isMouseInTrack = false;
let tooltipFrame: number | null = null;
const videoTimelineRef = useTemplateRef('videoTimelineRef');
const track = useTemplateRef('track');
const tooltip = useTemplateRef('tooltip');
const status = useVueStatusRef('mouseEnter', 'dragging');
const playerStore = usePlayerStore();
const currentTime = ref(playerStore.currentTime);
const mouseTime = ref(0);
const pointerPosition = ref(0);
const mousePosition = { x: 0, y: 0 };
const virtualTrigger: Measurable = {
	getBoundingClientRect: () => new DOMRect(mousePosition.x, mousePosition.y),
};
const tooltipPopperOptions = {
	strategy: 'fixed' as const,
	modifiers: [{ name: 'preventOverflow', options: { mainAxis: false } }],
};
const bufferRatios = computed(() => {
	return playerStore.buffer.map(([startTime, endTime]) => [getRatio(startTime), getRatio(endTime)]);
});
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
useEventListener(window, 'mousemove', handleTrackMouseMove);
useEventListener(window, 'pointerup', stopDragging);
useEventListener(window, 'pointercancel', stopDragging);
useEventListener(window, 'blur', () => stopDragging());

onBeforeUnmount(() => {
	if (tooltipFrame !== null) {
		cancelAnimationFrame(tooltipFrame);
	}
});

defineExpose({ seek });

const setCurrentTimeDebounce = useDebounceFn(async (time: number) => {
	playerStore.seek(time);
	await nextTick();
	playerStore.play();
	isSyncCurrentTime = true;
}, 500);

const trackMouseEnterDebounce = useDebounceFn((event: MouseEvent) => {
	updateHoverTime(event);
	status.onMouseEnter();
}, 100);
const trackMouseLeaveDebounce = useDebounceFn(() => {
	status.offMouseEnter();
	if (!status.dragging) {
		emit('hoverEnd');
	}
}, 100);

function handleTrackMouseEnter(event: MouseEvent) {
	isMouseInTrack = true;
	trackMouseLeaveDebounce.cancel();
	trackMouseEnterDebounce(event);
}

function handleTrackMouseLeave() {
	isMouseInTrack = false;
	trackMouseEnterDebounce.cancel();
	trackMouseLeaveDebounce();
}

function seek(time: number) {
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
	const timelineRect = videoTimelineRef.value?.getBoundingClientRect();
	if (timelineRect) {
		pointerPosition.value = rect.left - timelineRect.left + ratio * rect.width;
	}
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
	if ((!status.mouseEnter || !isMouseInTrack) && !status.dragging) {
		return;
	}
	updateHoverTime(event);
}

function updateHoverTime(event: MouseEvent | PointerEvent) {
	const time = getPointerTime(event);
	if (time !== null) {
		emit('hoverTime', time);
	}
}

function handleTrackClick(event: MouseEvent) {
	if (event.target instanceof Element && event.target.closest('[data-timeline-slider]')) {
		return;
	}
	const time = getPointerTime(event);
	if (time !== null) {
		seek(time);
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
		seek(time);
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
	if (!status.mouseEnter) {
		emit('hoverEnd');
	}
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-timeline {
	--bar-height: 12px;
	--bar-width: 24px;
	--progress-sale: 2;
	--pointer-gap: 5px;

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
	position: relative;
	.track {
		cursor: pointer;
		width: calc(100% - var(--bar-width) - 2px);
		height: calc(var(--progress-height) * var(--progress-sale));
		transition: transform 0.3s ease;
		transform-origin: bottom center;
		position: relative;
		z-index: 2;
		&:hover,
		&.in-track {
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
			height: var(--progress-height);
			background-color: map.get(token.$theme, 'video-timeline-bg');
			position: absolute;
			left: 0;
			bottom: 0;
			border-radius: calc(var(--progress-height) / 2);
			transition: border-radius 0.3s ease;
			overflow: hidden;
		}
		.buffer,
		.runway {
			position: absolute;
			top: 0;
			left: 0;
		}
		.buffer {
			width: calc(var(--end) - var(--start));
			height: 100%;
			background-color: map.get(token.$theme, 'video-timeline-buffer-bg');
			left: var(--start);
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
			transform: translateY(calc(var(--progress-height) * (var(--progress-sale) - 1) / 2));
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
	}
	.pointer {
		pointer-events: none;
		width: 0px;
		height: var(--progress-height);
		background-color: transparent;
		position: absolute;
		left: var(--x);
		bottom: 0;
		color: map.get(token.$theme, 'video-timeline-runway-bg');
		transition: height 0.3s ease;
		z-index: 1;
		&__icon {
			pointer-events: none;
			position: absolute;
			left: 0;
		}
		&__icon--top {
			bottom: calc(100% + var(--pointer-gap));
			transform: translateX(-50%);
		}
		&__icon--bottom {
			top: calc(100% + var(--pointer-gap));
			transform: translateX(-50%);
		}
		&.enter,
		&.dragging {
			height: calc(var(--progress-height) * var(--progress-sale));
		}
	}
}

.pointer-enter-active {
	animation: pop-in 0.25s ease-out;
}
.pointer-leave-active {
	animation: pop-out 0.18s ease-in forwards;
}

.timeline-tooltip {
	width: 160px;
	&.is-time-only {
		width: auto;
	}
	&__preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 6px;
		background-color: map.get(token.$theme, 'video-timeline-bg');
		border-radius: 4px;
		overflow: hidden;
		img {
			width: 100%;
			height: 100%;
			object-fit: contain;
		}
	}
	&__time {
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
}

@keyframes pop-in {
	0% {
		transform: scale(0.6);
		opacity: 0;
	}
	70% {
		transform: scale(1.05);
		opacity: 1;
	}
	100% {
		transform: scale(1);
	}
}
@keyframes pop-out {
	0% {
		transform: scale(1);
		opacity: 1;
	}
	100% {
		transform: scale(0.6);
		opacity: 0;
	}
}
</style>
