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

		<g :mask="`url(#${maskId})`" class="volume-toggle-icon__artwork">
			<path
				class="volume-toggle-icon__speaker"
				d="M466 96C492 96 512 117 512 146V878C512 907 492 928 466 928C447 928 430 919 414 905L252 726C235 711 220 704 194 704H154C122 704 96 678 96 646V378C96 346 122 320 154 320H194C220 320 235 313 252 298L414 119C430 105 447 96 466 96Z"
				fill="currentColor"
			/>

			<path
				class="volume-toggle-icon__wave volume-toggle-icon__wave--inner"
				:class="{ 'is-visible': displayVolume > 0 }"
				d="M552 358A170 170 0 0 1 552 666Z"
			/>
			<path
				class="volume-toggle-icon__wave volume-toggle-icon__wave--middle"
				:class="{ 'is-visible': displayVolume >= 31 }"
				d="M588 281A255 255 0 0 1 588 743"
			/>
			<path
				class="volume-toggle-icon__wave volume-toggle-icon__wave--outer"
				:class="{ 'is-visible': displayVolume >= 71 }"
				d="M638 175A372.136 372.136 0 0 1 638 849"
			/>
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

<style scoped lang="scss">
.volume-toggle-icon {
	$root: &;
	$motion-easing: cubic-bezier(0.22, 0.8, 0.32, 1);

	&__wave--middle,
	&__wave--outer,
	&__slash,
	&__slash-gap {
		fill: none;
		stroke-linecap: round;
	}

	&__wave--middle,
	&__wave--outer,
	&__slash {
		stroke: currentColor;
	}

	&__wave--inner {
		fill: currentColor;
	}

	&__mask {
		mask-type: luminance;
	}

	&__artwork {
		transition: opacity 180ms ease;
	}

	&__wave {
		--show-delay: 0ms;
		--hide-delay: 0ms;
		stroke-width: 64;
		opacity: 0;
		transform: translateX(-24%) scale(0.68);
		transform-box: fill-box;
		transform-origin: left center;
		transition:
			opacity 150ms ease var(--hide-delay),
			transform 260ms $motion-easing var(--hide-delay);

		&--inner {
			--hide-delay: 80ms;
		}

		&--middle {
			--show-delay: 50ms;
			--hide-delay: 40ms;
		}

		&--outer {
			--show-delay: 100ms;
		}

		&.is-visible {
			opacity: 1;
			transform: scale(1);
			transition-delay: var(--show-delay);
		}
	}

	&__slash,
	&__slash-gap {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		opacity: 0;
		transition:
			stroke-dashoffset 260ms $motion-easing,
			opacity 80ms linear 180ms;
	}

	&__slash {
		stroke-width: 76;
	}

	&__slash-gap {
		stroke: black;
		stroke-width: 136;
	}

	&.is-muted {
		#{$root}__artwork {
			opacity: 0.78;
		}

		#{$root}__slash,
		#{$root}__slash-gap {
			stroke-dashoffset: 0;
			opacity: 1;
			transition:
				stroke-dashoffset 260ms $motion-easing,
				opacity 80ms linear;
		}
	}
}
</style>
