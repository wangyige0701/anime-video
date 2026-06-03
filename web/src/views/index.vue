<template>
	<div class="index">
		<div class="index-video-list">
			<template v-for="(item, index) of videos" :key="item.id">
				<IndexVideoItem :item="item"></IndexVideoItem>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { useVideoStore } from '@/stores/video';
import { WebRoute } from '~routes/web';

definePage({
	name: WebRoute.INDEX,
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

<style scoped lang="scss">
.index {
	width: 100%;
	height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
}

.index-video-list {
	width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: var(--index-video-list-gap);
	padding: var(--container-padding);
}
</style>
