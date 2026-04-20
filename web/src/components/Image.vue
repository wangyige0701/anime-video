<template>
	<template v-if="isLoading">
		<div class="image-loading" :class="$attrs?.class ?? ''"></div>
	</template>
	<template v-else>
		<img :src="src" v-bind="$attrs" />
	</template>
</template>

<script setup lang="ts">
import { onBeforeMount, ref, useAttrs, type IntrinsicElementAttributes } from 'vue';

const props = defineProps<{
	src: string;
}>();
const isLoading = ref(true);
const attrs = useAttrs();

onBeforeMount(() => {
	const img = new Image();
	img.src = props.src;
	img.onload = () => {
		isLoading.value = false;
	};
});

defineOptions({
	inheritAttrs: false,
});
defineExpose({} as IntrinsicElementAttributes['img']);
</script>

<style scoped>
.image-loading {
	width: v-bind('attrs?.width ?? ' unset '');
	height: v-bind('attrs?.height ?? ' unset '');
}
</style>
