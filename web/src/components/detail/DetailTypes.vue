<template>
	<div class="detail-types">
		<el-popover placement="bottom-start" trigger="click" :show-arrow="false" popper-class="detail-metadata-popover">
			<template #reference>
				<div v-if="!types || !types.length" class="placeholder">选择类型</div>
			</template>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { seriesTypes } from '~config/seriesTypes';

const props = defineProps<{
	loading: boolean;
}>();
const emits = defineEmits<{
	(e: 'update:loading', id: number): void;
}>();

const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const types = computed(() => series.value.types);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use './metadata.scss' as *;
@use '@/scss/token.scss' as token;

.detail-types {
	@include metadata-item;
}

.placeholder {
	@include metadata-placeholder;
}
</style>
