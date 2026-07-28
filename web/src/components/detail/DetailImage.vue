<template>
	<div class="image-container">
		<div class="image-wrap">
			<div class="image" :style="{ '--count': props.images.length }">
				<template v-for="(image, index) in props.images" :key="image">
					<el-image
						class="image-view"
						:src="getImageUrl(getSeriesPath(image))"
						fit="cover"
						:preview-src-list="previewSrcList"
						:initial-index="index"
						:preview-teleported="true"
					></el-image>
				</template>
			</div>
		</div>
		<div class="dots">
			<span
				v-for="(dot, index) in props.images"
				:key="index"
				class="dot"
				:class="{ active: activeImage === dot }"
				@click.stop="changeActiveImage(dot)"
			></span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~routes/server';

const props = withDefaults(
	defineProps<{
		images?: string[];
	}>(),
	{
		images: () => [],
	},
);
const activeImage = ref('');
const offset = ref(0);
const previewSrcList = computed(() => {
	if (props.images?.length) {
		return props.images.map((image) => getImageUrl(getSeriesPath(image)));
	}
	return [];
});

const watchImages = watch(
	() => props.images,
	(newValue) => {
		if (!activeImage.value) {
			activeImage.value = newValue[0] ?? '';
		}
	},
);
watchEffect(() => {
	const index = props.images.indexOf(activeImage.value);
	if (index !== -1) {
		offset.value = index;
	}
});

function changeActiveImage(image: string) {
	watchImages.stop();
	activeImage.value = image;
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/image.scss' as image;

.image-container {
	width: 220px;
}
.image-wrap {
	cursor: pointer;
	@include image.image-wrap;
	box-shadow: 0 0 5px map.get(token.$theme, 'l-9');
	background-color: map.get(token.$theme, 'l-3');
}
.image {
	--count: 1;
	@include image.image;
	width: calc(100% * var(--count));
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	transition: transform 0.3s ease;
	transform: translateX(calc((-100% / var(--count)) * v-bind('offset')));
}
.image-view {
	width: 100%;
	height: 100%;
	flex: auto;
}

.dots {
	height: 30px;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	justify-content: center;
	align-items: center;
	gap: 8px;
}
.dot {
	--size: 8px;
	cursor: pointer;
	width: var(--size);
	height: var(--size);
	border-radius: 50%;
	background-color: map.get(token.$theme, 'l-9');
	transition: all 0.3s ease;
	&.active {
		background-color: #fff;
		transform: scale(1.2);
	}
}
</style>
