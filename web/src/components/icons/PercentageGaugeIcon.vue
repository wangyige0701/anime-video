<template>
	<svg
		class="percentage-gauge-icon"
		:style="{ '--percentage-gauge-offset': `${100 - normalizedPercentage}` }"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		:aria-label="`${percentageLabel}%`"
	>
		<circle class="percentage-gauge-icon__track" cx="12" cy="12" r="10.8" pathLength="100" />
		<circle class="percentage-gauge-icon__progress" cx="12" cy="12" r="10.8" pathLength="100" />
		<text class="percentage-gauge-icon__label" x="12" y="12" text-anchor="middle" dominant-baseline="central">
			{{ percentageLabel }}%
		</text>
	</svg>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		percentage?: number;
	}>(),
	{
		percentage: 0,
	},
);

const normalizedPercentage = computed(() => {
	const percentage = Number(props.percentage);
	if (!Number.isFinite(percentage)) {
		return 0;
	}
	return Math.min(100, Math.max(0, percentage));
});

const percentageLabel = computed(() => {
	const percentage = normalizedPercentage.value;
	return Number.isInteger(percentage) ? String(percentage) : percentage.toFixed(1).replace(/\.0$/, '');
});

defineOptions({
	inheritAttrs: true,
});
</script>

<style scoped lang="scss">
.percentage-gauge-icon {
	color: inherit;
	overflow: visible;

	&__track,
	&__progress {
		fill: none;
		stroke-width: 2.4;
	}

	&__track {
		stroke: currentColor;
		opacity: 0.22;
	}

	&__progress {
		stroke: currentColor;
		stroke-linecap: round;
		stroke-dasharray: 100;
		stroke-dashoffset: var(--percentage-gauge-offset);
		transform: rotate(-90deg);
		transform-box: fill-box;
		transform-origin: center;
		transition: stroke-dashoffset 360ms cubic-bezier(0.22, 0.8, 0.32, 1);
	}

	&__label {
		fill: currentColor;
		font-family: Arial, sans-serif;
		font-size: 5.4px;
		font-weight: 700;
		letter-spacing: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.percentage-gauge-icon__progress {
		transition: none;
	}
}
</style>
