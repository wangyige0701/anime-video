<template>
	<div class="index-video-item" @click="gotoDetail(item)">
		<div class="index-video-img-container">
			<Image :src="imagePath" class="index-video-img"></Image>
		</div>

		<div class="index-video-name">
			<span>{{ item.name }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { computed } from 'vue';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';
import Image from '@/components/Image.vue';
import { getSeriesPath } from '@/utils/series';
import router from '@/router';

const props = defineProps<{ item: Series }>();

const imagePath = computed(() => {
	if (!props.item.images.length) {
		return '';
	}
	return 'http://localhost:3000' + getImageUrl(getSeriesPath(props.item.rootPath, props.item.images[0]!));
});

function gotoDetail(item: Series) {
	router.push({ name: WebRoute.DETAIL, params: { name: item.name } });
}
</script>

<style scoped lang="scss">
.index-video-item {
	--radius: 8px;
	--padding: 5px;

	cursor: pointer;
	width: var(--index-video-item-width);
	display: flex;
	flex-direction: column;
	padding: var(--padding);
	background-color: var(--index-video-item-background-color);
	border-radius: var(--radius);
	transition: box-shadow 0.3s ease;

	&:hover {
		box-shadow: 0 0 0px 6px var(--index-video-item-background-color);
	}
}

.index-video-img-container {
	width: 100%;

	.index-video-img {
		width: 100%;
		object-fit: cover;
		border-radius: calc(var(--radius) - var(--padding) / 2);
	}
}

.index-video-name {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	font-size: 0.875rem;
	color: var(--index-video-item-name-color);
	text-decoration: none;
	padding: 0.5em;
}
</style>
