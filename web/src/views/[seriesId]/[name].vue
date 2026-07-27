<template>
	<div class="detail">
		<div class="top">
			<div class="image-container">
				<div class="image-wrap">
					<div class="image">
						<template v-for="(image, index) in series.images" :key="image">
							<el-image
								class="image-view"
								:src="getImageUrl(getSeriesPath(image))"
								fit="cover"
								:preview-src-list="previewSrcList"
								:initial-index="index"
							></el-image>
						</template>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Series } from '@/data/series';
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';
import router from '@/router';

definePage({
	name: 'Detail',
});

const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting', 'modifyDescription').onWaiting();
const series = shallowRef<Series>({} as Series);
const previewSrcList = computed(() => {
	if (series.value.images?.length) {
		return series.value.images.map((image) => getImageUrl(getSeriesPath(image)));
	}
	return [];
});

async function endEditDescription(value: string) {
	if (!value) {
		ElMessage.error('描述不能为空');
		return;
	}
	status.onModifyDescription();
	await series.value.updateDescription(value);
	status.offModifyDescription();
}

onMounted(async () => {
	try {
		const info = await useVideoStore().getSeriesDetail(seriesId);
		series.value = info;
		status.offWaiting();
	} catch (error) {
		router.replace({ name: WebRoute.INDEX, replace: true });
	}
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/image.scss' as image;

.detail {
	width: 100%;
}

.top {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: 20px;
}

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
	@include image.image;
}
.image-view {
	width: 100%;
	height: 100%;
}
</style>
