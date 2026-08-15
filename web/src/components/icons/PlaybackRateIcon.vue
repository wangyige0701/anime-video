<template>
	<svg
		class="playback-rate-icon"
		:class="{ 'is-active': active }"
		:style="{ '--playback-rate-duration': `${duration}ms` }"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<defs>
			<mask id="playback-rate-frame-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
				<rect width="24" height="24" fill="white" />
				<rect x="11.35" y="10.55" width="12.65" height="13.45" rx="1.6" fill="black" />
			</mask>
			<mask id="playback-rate-label-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
				<rect width="24" height="24" fill="white" />
				<rect x="10.9" y="9.8" width="13.1" height="14.2" rx="1.4" fill="black" />
			</mask>
		</defs>
		<rect
			class="playback-rate-icon__frame"
			x="1.25"
			y="1.3"
			width="21.5"
			height="16.85"
			rx="4.5"
			fill="none"
			mask="url(#playback-rate-frame-mask)"
		/>
		<text
			class="playback-rate-icon__label"
			x="8.9"
			y="12.8"
			text-anchor="middle"
			mask="url(#playback-rate-label-mask)"
		>
			{{ rateLabel }}
		</text>
		<g class="playback-rate-icon__arrows">
			<path
				class="playback-rate-icon__arrow playback-rate-icon__arrow--back"
				d="M11.95 11.75a1.35 1.35 0 0 1 2.13-1.08l4.82 3.66a2.45 2.45 0 0 1 0 3.92l-4.82 3.66a1.35 1.35 0 0 1-2.13-1.08z"
			/>
			<path
				class="playback-rate-icon__arrow playback-rate-icon__arrow--front"
				d="M16.25 11.75a1.35 1.35 0 0 1 2.13-1.08l4.82 3.66a2.45 2.45 0 0 1 0 3.92l-4.82 3.66a1.35 1.35 0 0 1-2.13-1.08z"
			/>
		</g>
	</svg>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		rate: number;
	}>(),
	{
		rate: 1,
	},
);

const active = ref(false);
const duration = 360;
let animationFrame: number | undefined;
let animationTimeout: ReturnType<typeof setTimeout> | undefined;

const rateLabel = computed(() => `${Number.isInteger(props.rate) ? props.rate : props.rate.toFixed(1)}x`);

function trigger() {
	if (animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
	}
	clearTimeout(animationTimeout);
	active.value = false;
	animationFrame = requestAnimationFrame(() => {
		active.value = true;
		animationFrame = undefined;
		animationTimeout = setTimeout(() => {
			active.value = false;
			animationTimeout = undefined;
		}, duration);
	});
}

onBeforeUnmount(() => {
	if (animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
	}
	clearTimeout(animationTimeout);
});

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	trigger,
});
</script>

<style scoped lang="scss">
.playback-rate-icon {
	$root: &;
	overflow: visible;

	&__frame,
	&__arrow,
	&__label {
		transform-box: fill-box;
		transform-origin: center;
	}

	&__frame {
		stroke: currentColor;
		stroke-width: 1.8;
	}

	&__label {
		fill: currentColor;
		font-family: Arial, sans-serif;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0;
	}

	&.is-active {
		#{$root}__arrow--back {
			animation: playback-rate-arrow-back var(--playback-rate-duration) cubic-bezier(0.2, 0.85, 0.32, 1);
		}

		#{$root}__arrow--front {
			animation: playback-rate-arrow-front var(--playback-rate-duration) cubic-bezier(0.2, 0.85, 0.32, 1);
		}

		#{$root}__frame,
		#{$root}__label {
			animation: playback-rate-frame var(--playback-rate-duration) cubic-bezier(0.2, 0.85, 0.32, 1);
		}
	}
}

@keyframes playback-rate-arrow-back {
	0% {
		opacity: 0.35;
		transform: translateX(-1.7px) scale(0.72);
	}

	40% {
		opacity: 1;
		transform: translateX(0.7px) scale(1.07);
	}

	68% {
		transform: translateX(-0.2px) scale(0.98);
	}

	100% {
		opacity: 1;
		transform: translateX(0) scale(1);
	}
}

@keyframes playback-rate-arrow-front {
	0%,
	18% {
		opacity: 0.4;
		transform: translateX(-1.2px) scale(0.76);
	}

	58% {
		opacity: 1;
		transform: translateX(0.9px) scale(1.08);
	}

	100% {
		opacity: 1;
		transform: translateX(0) scale(1);
	}
}

@keyframes playback-rate-frame {
	0%,
	100% {
		transform: scale(1);
	}

	42% {
		transform: translateX(0.35px) scale(1.035, 1.045);
	}

	68% {
		transform: translateX(0) scale(0.99);
	}
}
</style>
