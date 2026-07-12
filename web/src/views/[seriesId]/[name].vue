<template></template>

<script setup lang="ts">
import { Series } from '@/data/series';
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';
import router from '@/router';
import { ElMessage } from 'element-plus';

definePage({
	name: 'Detail',
});

const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting', 'modifyDescription').onWaiting();
const series = shallowRef<Series>({} as Series);
const image = computed(() => {
	if (series.value.images?.length) {
		return getImageUrl(getSeriesPath(series.value.images[0]!));
	}
	return '';
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

<style scoped lang="scss"></style>
