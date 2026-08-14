<template>
	<svg
		class="player-loading"
		viewBox="0 0 1024 1024"
		xmlns="http://www.w3.org/2000/svg"
		focusable="false"
		aria-hidden="true"
	>
		<g class="player-loading__stream">
			<circle
				v-for="index in 7"
				:key="index"
				class="player-loading__particle"
				:cx="242 + (index - 1) * 90"
				cy="512"
				r="31"
				:style="{ '--particle-index': index - 1 }"
			/>
		</g>
	</svg>
</template>

<style scoped lang="scss">
.player-loading {
	overflow: visible;
	color: inherit;

	&__particle {
		fill: currentColor;
		transform-box: fill-box;
		transform-origin: center;
		animation: player-loading-flow 1.45s cubic-bezier(0.4, 0, 0.2, 1) infinite;
		animation-delay: calc(var(--particle-index) * -110ms);
	}
}

@keyframes player-loading-flow {
	0%,
	100% {
		opacity: 0.28;
		transform: translateY(0) scale(0.72);
	}

	18% {
		opacity: 1;
		transform: translateY(-92px) scale(0.88, 1.7);
	}

	36% {
		opacity: 0.7;
		transform: translateY(0) scale(1);
	}

	54% {
		opacity: 0.9;
		transform: translateY(72px) scale(0.84, 1.35);
	}

	72% {
		opacity: 0.36;
		transform: translateY(0) scale(0.76);
	}
}

@media (prefers-reduced-motion: reduce) {
	.player-loading__particle {
		animation: none;
		opacity: 0.7;

		&:nth-child(2),
		&:nth-child(6) {
			transform: scale(0.82);
		}

		&:nth-child(1),
		&:nth-child(7) {
			transform: scale(0.64);
		}
	}
}
</style>
