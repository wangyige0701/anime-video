<template></template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { useVideoStore } from '@/stores/video';

definePage({
	name: 'Index',
});

const pageSize = 20;
const videos = shallowReactive<Series[]>([]);

async function getVideos(page = 1) {
	const data = await useVideoStore().pagination(page, pageSize);
	videos.splice(0, videos.length, ...data);
}

onBeforeMount(async () => {
	await getVideos();
});
</script>

<style scoped lang="scss"></style>
