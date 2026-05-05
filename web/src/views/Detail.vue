<template>
	<div class="detail">
		<div class="detail-container">
			<div class="detail-series-info">
				<div class="detail-series-left">
					<div class="detail-series-image-container">
						<template v-if="image">
							<img class="image" :src="image" :alt="series.name ?? ''" />
						</template>
						<template v-else-if="useVideoStore().isWaiting">
							<div class="image image-loading" style="min-height: calc(var(--image-width) * 1.1)"></div>
						</template>
					</div>
				</div>

				<div class="detail-series-content">
					<div class="detail-title">
						<span>{{ series.name ?? '' }}</span>
					</div>

					<div class="detail-desc">
						<span>{{ series.description ?? '' }}</span>
					</div>
				</div>
			</div>

			<div class="detail-series-list"></div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { computed, onBeforeMount, onMounted, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';
import type { Series } from '~types/videos';

const seriesId = useRoute().params.seriesId as string;
const series = shallowRef<Series>({} as Series);
const image = computed(() => {
	if (series.value.images?.length) {
		return getImageUrl(getSeriesPath(series.value.rootPath, series.value.images[0]!));
	}
	return '';
});

onBeforeMount(async () => {
	const info = await useVideoStore().getSeriesInfo(seriesId);
	if (info) {
		series.value = info;
	}
});

onMounted(() => {
	if (!series.value || !series.value.id) {
		useRouter().replace({ name: WebRoute.INDEX });
	}
});
</script>

<style>
:root {
	--right-side-offset: var(--left-side-offset);
}
</style>
<style scoped lang="scss">
.detail {
	--container-padding: 10px;
	--image-width: 200px;
	width: 100%;
	height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
}

.detail-container {
	width: 100%;
	display: flex;
	flex-direction: column;
	padding: var(--container-padding);
}

.detail-series-info {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: flex-start;
	padding: var(--container-padding);
	border-radius: 10px;
	background-color: var(--detail-block-background-color);
}

.detail-series-left {
	width: var(--image-width);
	padding: var(--container-padding);
	overflow: hidden;
}

.detail-series-image-container {
	width: 100%;
	border-radius: 10px;
	overflow: hidden;
}

// 信息文本
.detail-series-content {
	display: flex;
	flex-direction: column;
	flex: 1;
	gap: var(--container-padding);
	padding: var(--container-padding);
}

.detail-title {
	font-size: 1.5rem;
	color: #333;
}

.detail-desc {
	font-size: 1rem;
	color: #666;
}
</style>
