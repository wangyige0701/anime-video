<template>
	<svg
		class="volume-toggle-icon"
		:class="{ 'is-muted': isMuted }"
		viewBox="0 0 1024 1024"
		xmlns="http://www.w3.org/2000/svg"
	>
		<defs>
			<mask
				:id="maskId"
				class="volume-toggle-icon__mask"
				maskUnits="userSpaceOnUse"
				maskContentUnits="userSpaceOnUse"
				x="0"
				y="0"
				width="1024"
				height="1024"
			>
				<rect width="1024" height="1024" fill="white" />
				<path class="volume-toggle-icon__slash-gap" d="M170 110L894 834" pathLength="1" />
			</mask>
		</defs>

		<g :mask="`url(#${maskId})`">
			<g class="volume-toggle-icon__speaker-motion">
				<g transform="translate(340 512) scale(0.86) translate(-340 -512)">
					<path
						class="volume-toggle-icon__speaker"
						d="M468.992 169.536c29.312-22.528 64.128-40.768 101.312-25.088 36.864 15.616 48.64 53.12 53.76 90.048 5.248 37.824 5.248 89.92 5.248 154.688v245.568c0 64.768 0 116.864-5.184 154.752-5.12 36.864-16.96 74.368-53.76 89.984-37.248 15.744-72.064-2.56-101.376-25.088-30.016-23.04-68.032-61.888-112.832-107.584-23.04-23.552-38.336-34.944-53.76-41.28-15.616-6.4-34.496-9.152-67.456-9.152-28.544 0-54.08 0-73.408-2.048-20.224-2.112-39.04-6.656-56-18.24-32.192-22.016-44.544-54.208-49.28-83.84C52.864 570.24 53.248 545.984 53.568 526.464v-28.928c-0.32-19.52-0.64-43.776 2.816-65.92 4.672-29.568 17.024-61.76 49.28-83.776 16.896-11.52 35.712-16.128 55.936-18.24 19.328-1.984 44.8-1.984 73.344-1.984 33.024 0 51.904-2.752 67.456-9.152 15.488-6.4 30.72-17.792 53.76-41.28 44.8-45.696 82.88-84.608 112.896-107.648z"
						fill="currentColor"
					/>
				</g>
			</g>

			<g class="volume-toggle-icon__waves-motion">
				<path
					class="volume-toggle-icon__wave volume-toggle-icon__wave--inner"
					:class="{ 'is-visible': displayVolume > 0 }"
					d="M650 442C700 478 700 546 650 582"
				/>
				<path
					class="volume-toggle-icon__wave volume-toggle-icon__wave--middle"
					:class="{ 'is-visible': displayVolume >= 50 }"
					d="M750 380C830 440 830 584 750 644"
				/>
				<path
					class="volume-toggle-icon__wave volume-toggle-icon__wave--outer"
					:class="{ 'is-visible': displayVolume >= 100 }"
					d="M850 318C960 398 960 626 850 706"
				/>
			</g>
		</g>

		<path class="volume-toggle-icon__slash" d="M170 110L894 834" pathLength="1" />
	</svg>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';

const maskId = useId();
const props = withDefaults(
	defineProps<{
		volume?: number;
	}>(),
	{
		volume: 100,
	},
);
const emit = defineEmits<{
	(e: 'update:volume', volume: number): void;
}>();

const lastVolume = ref(props.volume);
const volumeModel = useVModel(props, 'volume', emit);
const volumeRef = ref(props.volume);
const volume = computed({
	get() {
		return volumeRef.value;
	},
	set(value) {
		volumeRef.value = value;
		volumeModel.value = value;
	},
});
const isMuted = computed(() => volume.value === 0);
const displayVolume = computed(() => (isMuted.value ? lastVolume.value : volume.value));

watch(
	() => props.volume,
	(value) => {
		setVolume(value);
	},
);

function toMute() {
	if (!isMuted.value) {
		lastVolume.value = volume.value;
	}
	volume.value = 0;
}

function toUnmute() {
	if (lastVolume.value === 0) {
		lastVolume.value = 1;
	}
	volume.value = lastVolume.value;
}

function toggleMute() {
	if (volume.value === 0) {
		toUnmute();
	} else {
		toMute();
	}
}

function setVolume(value: number) {
	if (value < 0) {
		value = 0;
	} else if (value > 100) {
		value = 100;
	}
	volume.value = value;
	if (value > 0) {
		lastVolume.value = value;
	}
}

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	toMute,
	toUnmute,
	toggleMute,
	setVolume,
});
</script>

<style scoped>
.volume-toggle-icon__wave,
.volume-toggle-icon__slash,
.volume-toggle-icon__slash-gap {
	fill: none;
	stroke-linecap: round;
}

.volume-toggle-icon__wave,
.volume-toggle-icon__slash {
	stroke: currentColor;
}

.volume-toggle-icon__mask {
	mask-type: luminance;
}

.volume-toggle-icon__speaker-motion,
.volume-toggle-icon__waves-motion {
	transform-box: view-box;
	transform-origin: center;
	transition:
		transform 260ms cubic-bezier(0.22, 0.8, 0.32, 1),
		opacity 180ms ease;
}

.volume-toggle-icon.is-muted .volume-toggle-icon__speaker-motion,
.volume-toggle-icon.is-muted .volume-toggle-icon__waves-motion {
	opacity: 0.78;
	transform: scale(0.96);
}

.volume-toggle-icon__wave {
	--show-delay: 0ms;
	--hide-delay: 0ms;
	stroke-width: 68;
	opacity: 0;
	transform: translateX(-24%) scale(0.68);
	transform-box: fill-box;
	transform-origin: left center;
	transition:
		opacity 150ms ease var(--hide-delay),
		transform 260ms cubic-bezier(0.22, 0.8, 0.32, 1) var(--hide-delay);
}

.volume-toggle-icon__wave--inner {
	--hide-delay: 80ms;
}

.volume-toggle-icon__wave--middle {
	--show-delay: 50ms;
	--hide-delay: 40ms;
}

.volume-toggle-icon__wave--outer {
	--show-delay: 100ms;
}

.volume-toggle-icon__wave.is-visible {
	opacity: 1;
	transform: scale(1);
	transition-delay: var(--show-delay);
}

.volume-toggle-icon__slash,
.volume-toggle-icon__slash-gap {
	stroke-dasharray: 1;
	stroke-dashoffset: 1;
	opacity: 0;
	transition:
		stroke-dashoffset 260ms cubic-bezier(0.22, 0.8, 0.32, 1),
		opacity 80ms linear 180ms;
}

.volume-toggle-icon__slash {
	stroke-width: 76;
}

.volume-toggle-icon__slash-gap {
	stroke: black;
	stroke-width: 136;
}

.volume-toggle-icon.is-muted .volume-toggle-icon__slash,
.volume-toggle-icon.is-muted .volume-toggle-icon__slash-gap {
	stroke-dashoffset: 0;
	opacity: 1;
	transition:
		stroke-dashoffset 260ms cubic-bezier(0.22, 0.8, 0.32, 1),
		opacity 80ms linear;
}
</style>
