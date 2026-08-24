<template>
	<div class="video-core" ref="videoCoreRef">
		<div class="video-player">
			<VideoPlayer
				ref="videoPlayerRef"
				:container="videoCoreRef || void 0"
				@auto-next="videoControllerRef?.autoNext()"
			/>
		</div>
		<div
			ref="videoMask"
			class="video-mask"
			:class="{ 'is-controller-active': playerStore.isControllerActive }"
			@click.stop="handleMaskClick"
			@dblclick="handleMaskDoubleClick"
		>
			<div class="video-title">
				<VideoTitle />
			</div>
			<div ref="videoController" class="video-controller">
				<VideoController
					ref="videoControllerRef"
					@toggle-fullscreen="toggleFullscreen"
					@shot="videoPlayerRef?.shot()"
				/>
			</div>
			<div ref="closeButton" class="close">
				<el-button text @click.stop="close">
					<el-icon size="2rem">
						<CloseBold />
					</el-icon>
				</el-button>
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
			<Transition name="fade">
				<div v-if="status.volume" class="volume-tip">
					<el-icon class="video-icon">
						<VolumeToggleIcon
							ref="volumeIcon"
							:volume="playerStore.volume"
							@update:volume="playerStore.setVolume($event)"
						/>
					</el-icon>
					<span>{{ playerStore.volume }}%</span>
				</div>
			</Transition>
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
import { KeyboardAction, useKeyboardAction } from '@/keyboard/action.ts';
import { useEventListener } from '@vueuse/core';
import { isEditingElement } from '@/utils/is.ts';
import { triggerKeyboardEvent } from '@/keyboard/trigger.ts';

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const playerStore = usePlayerStore();
const videoCoreRef = useTemplateRef('videoCoreRef');
const videoMask = useTemplateRef('videoMask');
const videoPlayerRef = useTemplateRef('videoPlayerRef');
const videoController = useTemplateRef('videoController');
const closeButton = useTemplateRef('closeButton');
const videoControllerRef = useTemplateRef('videoControllerRef');
const status = useVueStatusRef('volume');
let playToggleTimeout: ReturnType<typeof setTimeout> | undefined;
let volumeTipTimeout: ReturnType<typeof setTimeout> | undefined;

useKeyboardAction(KeyboardAction.VolumeUp, () => volumeUp(10));
useKeyboardAction(KeyboardAction.VolumeDown, () => volumeDown(10));
useKeyboardAction(KeyboardAction.ToggleFullscreen, toggleFullscreen);

useVideoControllerActivity({
	container: videoMask,
	controller: videoController,
	persistentTargets: [closeButton],
	activate: playerStore.triggerControllerActive,
	hold: () => playerStore.clearControllerActiveTimeout(true),
	deactivate: playerStore.triggerControllerInactive,
});

useEventListener(window, 'keydown', (e) => {
	if (isEditingElement(e.target)) {
		return;
	}
	triggerKeyboardEvent(e);
});

useEventListener(
	videoCoreRef,
	'click',
	(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest) {
			return;
		}
		const button = target.closest('button');
		if (!button) {
			return;
		}
		button.blur();
	},
	{ capture: true },
);

onBeforeUnmount(() => {
	playToggleTimeout && clearTimeout(playToggleTimeout);
});

function toggleFullscreen() {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	} else {
		videoCoreRef.value?.requestFullscreen();
	}
}

function handleMaskClick() {
	clearTimeout(playToggleTimeout);
	playToggleTimeout = setTimeout(() => {
		playToggleTimeout = undefined;
		playerStore.togglePlay();
		playerStore.triggerControllerActive();
	}, 200);
}

function handleMaskDoubleClick() {
	clearTimeout(playToggleTimeout);
	playToggleTimeout = undefined;
	toggleFullscreen();
}

function close() {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	}
	emit('close');
}

function volumeUp(step = 10) {
	playerStore.setVolume(playerStore.volume + step);
	showVolumeTip();
}

function volumeDown(step = 10) {
	playerStore.setVolume(playerStore.volume - step);
	showVolumeTip();
}

function showVolumeTip() {
	if (volumeTipTimeout) {
		clearTimeout(volumeTipTimeout);
	}
	status.onVolume();
	volumeTipTimeout = setTimeout(() => {
		volumeTipTimeout = void 0;
		status.offVolume();
	}, 1000);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-core {
	width: 100%;
	height: 100%;
	position: relative;
	:deep(.el-button) {
		--el-fill-color-light: transparent;
		--el-fill-color: transparent;
		--el-button-hover-bg-color: transparent;
		--el-button-hover-text-color: inherit;
		--el-button-disabled-bg-color: transparent;
		--el-button-disabled-text-color: inherit;
		--el-button-active-bg-color: transparent;
		--el-button-active-text-color: inherit;
		height: auto;
		padding: 0;
		color: inherit;
		border: none;
	}
}

.video-player,
.video-mask {
	position: absolute;
	inset: 0;
}
.video-mask {
	cursor: none;
	z-index: 10;
	&.is-controller-active {
		cursor: pointer;
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

.volume-tip {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	gap: 5px;
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	background-color: map.get(token.$theme, 'l-9');
	color: map.get(token.$theme, 'd-9');
	box-shadow: 0 0 5px map.get(token.$theme, 'l-6');
	border-radius: 5px;
	font-size: 1.2rem;
	font-weight: 500;
	padding: 10px 1rem;
	z-index: 30;
}
</style>
