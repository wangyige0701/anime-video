<template>
	<svg
		class="episode-playing-icon"
		:class="{ 'is-playing': isPlaying }"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		focusable="false"
		aria-hidden="true"
	>
		<rect v-for="index in 3" :key="index" :x="3 + (index - 1) * 7" y="5" width="4" height="14" rx="1" />
	</svg>
</template>

<script setup lang="ts">
withDefaults(
	defineProps<{
		isPlaying?: boolean;
	}>(),
	{
		isPlaying: false,
	},
);
</script>

<style scoped lang="scss">
.episode-playing-icon {
	display: block;
	overflow: visible;

	rect {
		fill: currentColor;
		transform-box: fill-box;
		transform-origin: center;
		animation: episode-playing-pulse 720ms ease-in-out infinite alternate;
		animation-play-state: paused;

		&:nth-child(2) {
			animation-delay: -240ms;
		}

		&:nth-child(3) {
			animation-delay: -480ms;
		}
	}

	&.is-playing rect {
		animation-play-state: running;
	}
}

@keyframes episode-playing-pulse {
	from {
		transform: scaleY(0.48);
	}

	to {
		transform: scaleY(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.episode-playing-icon rect {
		animation: none;
	}
}
</style>
