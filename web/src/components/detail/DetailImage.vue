<template>
	<div class="image-container">
		<div
			class="image-wrap"
			:class="{ 'more-margin': props.images.length <= 1 }"
			@mouseover.stop="onInside"
			@mouseleave.stop="offInside"
		>
			<div
				class="image"
				:class="{ transition: status.transition }"
				:style="{ '--count': props.images.length > 1 ? props.images.length + 1 : 1 }"
			>
				<template v-for="(image, index) in props.images" :key="image">
					<el-image
						class="image-view"
						:src="getImageUrl(getSeriesPath(image))"
						fit="cover"
						:preview-src-list="previewSrcList"
						:initial-index="index"
						:preview-teleported="true"
						:hide-on-click-modal="true"
					></el-image>
				</template>
				<template v-if="props.images.length > 1">
					<el-image
						class="image-view"
						:src="getImageUrl(getSeriesPath(props.images[0]!))"
						fit="cover"
						:preview-src-list="previewSrcList"
						:initial-index="0"
						:preview-teleported="true"
						:hide-on-click-modal="true"
					></el-image>
				</template>
			</div>
		</div>
		<div class="dots" v-if="props.images.length > 1">
			<span
				v-for="(dot, index) in props.images"
				:key="index"
				class="dot"
				:class="{ active: activeImage === dot }"
				@click.stop="changeActiveImage(dot)"
				@mouseover.stop="onInside"
				@mouseleave.stop="offInside"
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

let autoChangeIntervalId: number | null = null;
const status = useVueStatusRef('inside', 'click', 'transition').onTransition();
const autoChangeInterval = ref<number>(5000);
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
	if (index !== -1 && index !== offset.value) {
		status.onTransition();
		const oldOffset = offset.value;
		if (!status.click && oldOffset === props.images.length - 1 && index === 0) {
			offset.value = props.images.length;
			setTimeout(() => {
				status.offTransition();
				offset.value = 0;
			}, 300);
		} else {
			offset.value = index;
		}
		status.offClick();
	}
	status.inside;
	autoChangeInterval.value;
	autoChangeImage();
});

function changeActiveImage(image: string) {
	status.onClick();
	watchImages.stop();
	activeImage.value = image;
}

function onInside() {
	status.onInside();
	if (autoChangeIntervalId) {
		clearTimeout(autoChangeIntervalId);
	}
}

function offInside() {
	status.offInside();
}

function autoChangeImage() {
	if (!props.images?.length || props.images.length === 1 || status.inside || !autoChangeInterval.value) {
		return;
	}
	if (autoChangeIntervalId) {
		clearTimeout(autoChangeIntervalId);
	}
	autoChangeIntervalId = setTimeout(() => {
		autoChangeIntervalId = null;
		const nextIndex = (offset.value + 1) % props.images.length;
		activeImage.value = props.images[nextIndex] ?? '';
		autoChangeImage();
	}, autoChangeInterval.value);
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
	&.more-margin {
		margin-bottom: 30px;
	}
}
.image {
	--count: 1;
	@include image.image;
	width: calc(100% * var(--count));
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	transform: translateX(calc((-100% / var(--count)) * v-bind('offset')));
	&.transition {
		transition: transform 0.3s ease;
	}
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
