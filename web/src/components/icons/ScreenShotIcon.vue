<template>
	<svg
		class="screen-shot-icon"
		:class="{ 'is-active': active }"
		viewBox="0 0 1024 1024"
		xmlns="http://www.w3.org/2000/svg"
	>
		<g class="screen-shot-icon__rotator">
			<g v-for="index in 6" :key="index" :transform="`rotate(${(index - 1) * 60} 512 512)`">
				<path
					class="screen-shot-icon__section"
					d="M649.8 84.3C781.9 126.9 887.1 229.1 934 359.2l-427.3 39.9L649.8 84.3z"
				/>
			</g>
		</g>
	</svg>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';

const props = withDefaults(
	defineProps<{
		active?: boolean;
	}>(),
	{
		active: false,
	},
);
const emit = defineEmits<{
	(e: 'update:active', value: boolean): void;
}>();

let resetTimer: ReturnType<typeof setTimeout> | undefined;
let animationFrame: number | undefined;
const activeModel = useVModel(props, 'active', emit);
const activeRef = ref(props.active);
const active = computed({
	get() {
		return activeRef.value;
	},
	set(value) {
		activeRef.value = value;
		activeModel.value = value;
	},
});

watch(
	() => props.active,
	(newValue) => {
		if (newValue && !activeRef.value) {
			trigger();
			return;
		}
		active.value = activeRef.value;
	},
);

function trigger() {
	clearTimeout(resetTimer);
	if (animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
	}
	if (active.value) {
		return;
	}
	active.value = false;
	animationFrame = requestAnimationFrame(() => {
		active.value = true;
		resetTimer = setTimeout(() => {
			active.value = false;
		}, 700);
	});
}

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	trigger,
});
</script>

<style scoped>
.screen-shot-icon {
	overflow: visible;
}

.screen-shot-icon__rotator,
.screen-shot-icon__section {
	transform-box: view-box;
	transform-origin: 512px 512px;
}

.screen-shot-icon.is-active .screen-shot-icon__rotator {
	animation: screen-shot-spin 700ms cubic-bezier(0.22, 0.8, 0.32, 1);
}

.screen-shot-icon.is-active .screen-shot-icon__section {
	animation: screen-shot-gather 700ms cubic-bezier(0.22, 0.8, 0.32, 1);
}

@keyframes screen-shot-spin {
	50% {
		transform: rotate(180deg);
	}

	100% {
		transform: rotate(360deg);
	}
}

@keyframes screen-shot-gather {
	50% {
		transform: translate(-4%, 4%);
	}
}
</style>
