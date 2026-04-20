<template>
	<div class="index">
		<div class="index-video-list">
			<div class="index-video-list-container">
				<template v-for="(item, index) of videos" :key="item.id">
					<IndexVideoItem :item="item"></IndexVideoItem>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { onBeforeMount, shallowReactive } from 'vue';
import { getSeriesInfos } from '@/api';
import IndexVideoItem from '@/components/IndexVideoItem.vue';

const videos = shallowReactive<Series[]>([]);

async function getVideos() {
	const data = await getSeriesInfos();
	videos.splice(0, videos.length, ...data.data);
}

onBeforeMount(async () => {
	await getVideos();
});
</script>

<style scoped lang="scss">
.index {
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.index-video-list {
	width: 100%;
	height: 100%;
	padding: var(--index-video-list-padding);
	overflow-x: hidden;
	overflow-y: auto;
}

.index-video-list-container {
	width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: var(--index-video-list-gap);
	padding: var(--index-video-list-gap);
}
</style>
