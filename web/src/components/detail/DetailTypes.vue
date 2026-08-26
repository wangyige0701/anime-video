<template>
	<div class="detail-types">
		<el-popover placement="bottom-start" trigger="click" :show-arrow="false" :offset="0">
			<template #reference>
				<div class="status-list metadata-container">
					<template v-if="types && types.length">
						<span v-for="type in types" :key="type">{{ getSeriesTypeName(type) }}</span>
					</template>
					<template v-else>
						<span class="no-data">选择类型</span>
					</template>
				</div>
			</template>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { getSeriesTypeName } from '~config/seriesTypes';

const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const types = computed(() => series.value.types);
</script>

<style scoped lang="scss">
@use './metadata.scss' as *;

.detail-types {
	@include metadata-item;
}

.metadata-container {
	@include metadata-container;
}

.no-data {
	@include metadata-no-data;
}
</style>
