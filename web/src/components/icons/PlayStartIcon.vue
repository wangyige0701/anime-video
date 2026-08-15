<template>
	<svg
		class="play-start-icon"
		:class="{ 'is-active': active }"
		:style="{ '--play-start-duration': `${duration}ms` }"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path ref="loopGuide" class="play-start-icon__guide" :d="arrowLoopPath" fill="none" />
		<path
			class="play-start-icon__line"
			d="M11.15 18.5h5.1A3.75 3.75 0 0 0 20 14.75v-5.5a3.75 3.75 0 0 0-3.75-3.75H9.5"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="3"
		/>
		<g v-show="!active" class="play-start-icon__arrow" transform="translate(6.8 5.5)">
			<path :d="arrowPath" fill="currentColor" />
		</g>
		<g v-if="active" class="play-start-icon__arrow-runner" :transform="arrowTransform">
			<path :d="arrowPath" fill="currentColor" />
		</g>
	</svg>
</template>

<script setup lang="ts">
const active = ref(false);
const duration = 380;
const staticArrowTransform = 'translate(6.8 5.5) rotate(0)';
const arrowTransform = ref(staticArrowTransform);
const arrowLoopPath =
	'M6.8 5.5H5.8a1.5 1.5 0 0 0-1.5 1.5v10a1.5 1.5 0 0 0 1.5 1.5h10.45A3.75 3.75 0 0 0 20 14.75v-5.5A3.75 3.75 0 0 0 16.25 5.5H6.8';
const arrowPath = 'M1.85-3c.6 0 .95.48.95 1.05v3.9c0 .57-.35 1.05-.95 1.05L-2.75.7c-.6-.35-.6-1.05 0-1.4z';
let animationFrame: number | undefined;
const loopGuide = useTemplateRef<SVGPathElement>('loopGuide');

function trigger() {
	if (animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
	}
	active.value = false;
	arrowTransform.value = staticArrowTransform;
	animationFrame = requestAnimationFrame((startTime) => {
		active.value = true;
		animateArrow(startTime);
	});
}

function animateArrow(startTime: number) {
	const progress = Math.min((performance.now() - startTime) / duration, 1);
	updateArrowPosition(easeInOutCubic(progress));
	if (progress < 1) {
		animationFrame = requestAnimationFrame(() => animateArrow(startTime));
		return;
	}
	arrowTransform.value = staticArrowTransform;
	animationFrame = requestAnimationFrame(() => {
		active.value = false;
		animationFrame = undefined;
	});
}

function updateArrowPosition(progress: number) {
	const guide = loopGuide.value;
	if (!guide) {
		return;
	}
	const length = guide.getTotalLength();
	const distance = length * progress;
	const point = guide.getPointAtLength(distance);
	const sampleDistance = Math.min(0.5, length / 100);
	const before = guide.getPointAtLength(Math.max(distance - sampleDistance, 0));
	const after = guide.getPointAtLength(Math.min(distance + sampleDistance, length));
	const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI - 180;
	arrowTransform.value = `translate(${point.x} ${point.y}) rotate(${angle})`;
}

function easeInOutCubic(value: number) {
	return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

onBeforeUnmount(() => {
	if (animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
	}
});

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	trigger,
});
</script>

<style scoped lang="scss">
.play-start-icon {
	$root: &;
	overflow: visible;

	&__guide {
		visibility: hidden;
	}

	&__arrow-runner {
		will-change: transform;
	}

	&.is-active {
		#{$root}__line {
			animation: play-start-line var(--play-start-duration) cubic-bezier(0.22, 0.8, 0.32, 1);
		}
	}
}

@keyframes play-start-line {
	0%,
	100% {
		stroke-width: 3;
		opacity: 1;
		filter: none;
	}

	48% {
		stroke-width: 3.35;
		opacity: 0.82;
		filter: drop-shadow(0 0 1.2px currentColor);
	}
}
</style>
