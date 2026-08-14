<template>
	<div class="video-volume" :class="{ dragging: playStore.isVolumeDragging }">
		<el-icon class="video-icon" :size="props.size" @click.stop="volumeIcon?.toggleMute()">
			<VolumeToggleIcon
				ref="volumeIcon"
				:volume="playStore.volume"
				@update:volume="playStore.setVolume($event)"
			/>
		</el-icon>
		<div class="video-volume__bg">
			<div class="video-volume__slider">
				<div class="video-volume__gap"></div>
				<el-slider
					data-volume-slider
					:min="0"
					:max="100"
					size="small"
					:show-tooltip="false"
					:model-value="playStore.volume"
					@update:model-value="playStore.setVolume($event as number)"
				></el-slider>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';

const props = defineProps<{
	size: number | string;
}>();

const playStore = usePlayerStore();
const volumeIcon = useTemplateRef('volumeIcon');
</script>

<style scoped lang="scss">
@use 'sass:map';
@use 'sass:list';
@use '@/scss/token.scss' as token;

.video-volume {
	--size: v-bind('props.size');
	--inner: 5px;
	--slider-width: 100px;
	--slider-bar-size: 12px;
	--transition-suffix: 0.3s ease;

	@mixin transition($property...) {
		transition-duration: 0.3s;
		transition-timing-function: ease;
		transition-property: list.join($property, (), comma);
	}

	cursor: pointer;
	width: var(--size);
	display: inline-flex;
	position: relative;
	@include transition(width);
	&:hover,
	&.dragging {
		width: calc(var(--size) + var(--slider-width) + var(--slider-bar-size) * 1.5);
		.video-icon {
			transform: scale(1.1);
		}
		.video-volume__bg {
			border-color: map.get(token.$theme, 'l-9');
			transition-delay: 0s;
		}
		.video-volume__slider {
			width: calc(var(--slider-width) + (var(--size) + var(--inner) * 2) + var(--slider-bar-size) * 1.5);
			background-color: map.get(token.$theme, 'video-controller-dark');
		}
		.el-slider {
			opacity: 1;
		}
	}
	.video-icon {
		isolation: isolate;
		@include transition(transform);
		z-index: 10;
	}
	.video-volume__bg {
		min-width: calc(var(--size) + var(--inner) * 2);
		height: calc(var(--size) + var(--inner) * 2);
		position: absolute;
		top: calc(var(--inner) * -1);
		left: calc(var(--inner) * -1);
		border-radius: calc((var(--size) + var(--inner) * 2) / 2);
		border: 1px solid transparent;
		@include transition(border-color);
		transition-delay: 0.15s;
		z-index: 1;
	}
	.video-volume__slider {
		cursor: default;
		width: 0;
		height: 100%;
		display: inline-flex;
		align-items: center;
		border-radius: calc((var(--size) + var(--inner) * 2) / 2);
		padding-left: calc(var(--size) + var(--inner) * 2);
		@include transition(width, background-color);
		overflow: hidden;
	}
	.video-volume__gap {
		width: calc(var(--slider-bar-size) / 2);
		height: 100%;
		flex-shrink: 0;
	}
	.el-slider {
		--el-slider-button-size: var(--slider-bar-size);
		--el-slider-button-wrapper-size: var(--slider-bar-size);
		--el-slider-height: 4px;
		--el-slider-runway-bg-color: #{map.get(token.$theme, 'l-9')};
		--el-slider-main-bg-color: #{map.get(token.$theme, 'l-3')};
		width: var(--slider-width);
		height: 100%;
		flex-shrink: 0;
		opacity: 0;
		@include transition(opacity);
		:deep(.el-slider__button-wrapper) {
			top: calc(var(--el-slider-height) / 2);
			transform: translate(-50%, -50%);
		}
		:deep(.el-slider__button) {
			border: none;
			background-color: map.get(token.$theme, 'l-5');
			vertical-align: top;
		}
	}
}
</style>
