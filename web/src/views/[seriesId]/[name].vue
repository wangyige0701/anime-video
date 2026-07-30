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
				<DetailDescription :series="series" :disabled="status.waiting" />
			</div>
		</div>

		<el-collapse accordion class="list" v-model="activeSeasonId">
			<template v-for="season in series.seasons" :key="season.id">
				<DetailSeason :season="season"></DetailSeason>
			</template>
		</el-collapse>
	</div>
</template>

<script setup lang="ts">
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
const status = useVueStatusRef('waiting').onWaiting();
const series = shallowRef<Series>({} as Series);
let _activeSeasonId = '';
const activeSeasonId = computed({
	get() {
		return _activeSeasonId || series.value.seasons?.[0]?.id || '';
	},
	set(value) {
		_activeSeasonId = value;
	},
});

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
	margin-bottom: 30px;

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

.list {
	border: 0;
}
</style>
