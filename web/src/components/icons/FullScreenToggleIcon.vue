<template>
	<svg
		class="full-screen-icon"
		:class="{ 'is-full-screen': fullScreen }"
		viewBox="0 0 1024 1024"
		xmlns="http://www.w3.org/2000/svg"
	>
		<g v-for="index in 4" :key="index" :transform="`rotate(${(index - 1) * 90} 512 512)`">
			<path
				class="full-screen-icon__corner"
				d="M340 126L214 126C165 126 126 165 126 214L126 340"
				fill="none"
				stroke="currentColor"
				stroke-width="76"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</g>
	</svg>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';

const props = withDefaults(
	defineProps<{
		fullScreen?: boolean;
	}>(),
	{
		fullScreen: false,
	},
);
const emit = defineEmits<{
	(e: 'update:fullScreen', fullScreen: boolean): void;
}>();

const fullScreenModel = useVModel(props, 'fullScreen', emit);
const fullScreenRef = ref(props.fullScreen);
const fullScreen = computed({
	get() {
		return fullScreenRef.value;
	},
	set(value) {
		fullScreenRef.value = value;
		fullScreenModel.value = value;
	},
});

watch(
	() => props.fullScreen,
	(value) => {
		if (value) {
			toFullScreen();
		} else {
			toFullScreenExit();
		}
	},
);

function toFullScreen() {
	if (!fullScreen.value) {
		fullScreen.value = true;
	}
}

function toFullScreenExit() {
	if (fullScreen.value) {
		fullScreen.value = false;
	}
}

function toggle() {
	fullScreen.value = !fullScreen.value;
}

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	toFullScreen,
	toFullScreenExit,
	toggle,
});
</script>

<style scoped>
.full-screen-icon__corner {
	d: path('M 340 126 L 214 126 C 165 126 126 165 126 214 L 126 340');
	transition: d 360ms cubic-bezier(0.22, 0.8, 0.32, 1);
}

.full-screen-icon.is-full-screen .full-screen-icon__corner {
	d: path('M 400 186 L 400 312 C 400 361 361 400 312 400 L 186 400');
}
</style>
