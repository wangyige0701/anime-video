<template>
	<svg
		class="play-next-icon"
		:class="{ 'is-active': active }"
		:style="{ '--play-next-duration': `${duration}ms` }"
		viewBox="0 0 1137 1024"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			class="play-next-icon__triangle"
			d="M169.77499975 62c18.45 0 36.5000001 5.64999961 52.1499999 16.30000019l503.2000002 342.74999971c46.05000029 31.3999998 60.09999961 97.54999981 31.30000049 147.80000039-7.94999971 13.79999971-18.65000039 25.49999971-31.30000049 34.09999981L221.87500044 945.6999998c-46.10000039 31.3999998-106.80000028 16.0999998-135.60000029-34.0999998A114.50000039 114.50000039 0 0 1 71.37500005 854.74999971L71.37500005 169.25000029C71.37500006 109.99999971 115.42499995 62 169.77499975 62z"
		/>
		<path
			class="play-next-icon__bar"
			d="M971.37500005 62a100.0000002 100.0000002 0 0 1 100.0000002 100.00000019l0 699.99999962a100.0000002 100.0000002 0 1 1-200.0000004-1e-8L871.37499986 162.0000002a100.0000002 100.0000002 0 0 1 100.00000019-100.0000002z"
		/>
	</svg>
</template>

<script setup lang="ts">
const active = ref(false);
const duration = 800;

function trigger() {
	if (active.value) {
		return;
	}
	active.value = true;
	setTimeout(() => {
		active.value = false;
	}, duration);
}

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	trigger,
});
</script>

<style scoped>
.play-next-icon__triangle,
.play-next-icon__bar {
	transform-box: fill-box;
	transform-origin: center;
}

.play-next-icon.is-active .play-next-icon__triangle {
	animation: play-next-triangle var(--play-next-duration) cubic-bezier(0.22, 0.8, 0.32, 1);
}

.play-next-icon.is-active .play-next-icon__bar {
	animation: play-next-bar var(--play-next-duration) cubic-bezier(0.22, 0.8, 0.32, 1);
}

@keyframes play-next-triangle {
	0% {
		opacity: 1;
		transform: translateX(0) scale(1);
	}

	38% {
		opacity: 1;
		transform: translateX(18%) scale(0.9, 1.03);
	}

	48% {
		opacity: 0;
		transform: translateX(24%) scale(0.82, 0.98);
	}

	49% {
		opacity: 0;
		transform: translateX(-16%) scale(0.9);
	}

	64% {
		opacity: 1;
		transform: translateX(2%) scale(1.02);
	}

	76% {
		transform: translateX(-1.2%) scale(0.99);
	}

	88% {
		transform: translateX(0.5%) scale(1);
	}

	100% {
		opacity: 1;
		transform: translateX(0) scale(1);
	}
}

@keyframes play-next-bar {
	0%,
	30% {
		transform: translateX(0) scaleY(1);
	}

	46% {
		transform: translateX(14%) scaleY(0.92);
	}

	60% {
		transform: translateX(-5%) scaleY(1.04);
	}

	72% {
		transform: translateX(3%) scaleY(0.98);
	}

	84% {
		transform: translateX(-1.5%) scaleY(1.01);
	}

	100% {
		transform: translateX(0) scaleY(1);
	}
}
</style>
