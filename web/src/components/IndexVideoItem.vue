<template>
	<div class="index-video-item">
		<div class="index-video-img-container">
			<Image :src="imagePath" class="index-video-img"></Image>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import Image from '@/components/Image.vue';
import { getSeriesPath } from '@/utils/series';
import { computed } from 'vue';
import { getImageUrl } from '@config/route';

const props = defineProps<{ item: Series }>();

const imagePath = computed(() => {
	if (!props.item.images.length) {
		return '';
	}
	return 'http://localhost:3000' + getImageUrl(getSeriesPath(props.item.rootPath, props.item.images[0]!));
});
</script>

<style scoped lang="scss">
.index-video-item {
	cursor: pointer;
	width: var(--index-video-item-width);
	display: flex;
	flex-direction: column;
	padding: 5px;
	background-color: var(--index-video-item-background-color);
	border-radius: 10px;
}

.index-video-img-container {
	width: 100%;
}

.index-video-img-container .index-video-img {
	width: 100%;
	object-fit: cover;
	border-radius: 10px;
}
</style>
