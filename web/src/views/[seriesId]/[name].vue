<template>
	<div class="detail">
		<div class="top">
			<DetailImage :images="series.images" />
			<div class="info">
				<div class="title">{{ series.title }}</div>
				<div class="types">
					<span v-for="type in series.types" :key="type">
						{{ getSeriesTypeName(type) }}
					</span>
				</div>
				<div class="status">
					<span>{{ getSeriesStatusName(series.status) }}</span>
				</div>
				<div class="description">
					<TextEditor
						:value="series.description"
						:loading="status.modifyDescription"
						:disabled="status.waiting"
						@blur="endEditDescription"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Series } from '@/data/series';
import { useVideoStore } from '@/stores/video';
import { WebRoute } from '~routes/web';
import router from '@/router';
import { getSeriesTypeName } from '~config/seriesTypes';
import { getSeriesStatusName } from '~config/seriesStatus';

definePage({
	name: 'Detail',
});

const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting', 'modifyDescription').onWaiting();
const series = shallowRef<Series>({} as Series);

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

.detail {
	--padding: 50px;
	width: 100%;
	padding-left: var(--padding);
	padding-right: calc(token.$menu-width + token.$main-padding + var(--padding));
}

.top {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: 20px;

	.info {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
		color: token.$text-color-secondary;
		font-size: 1rem;
	}
	.title {
		color: token.$text-color-primary;
		font-size: 1.4rem;
	}
}
</style>
