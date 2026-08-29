<template>
	<div class="detail-date">
		<el-popover placement="bottom-start" trigger="click" :show-arrow="false" popper-class="detail-metadata-popover">
			<template #reference>
				<div v-if="isPlaceholder" class="placeholder">选择上线时间</div>
			</template>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { isNumber } from '@wang-yige/utils';

const props = defineProps<{
	loading: boolean;
}>();
const emits = defineEmits<{
	(e: 'update:loading', id: number): void;
}>();

const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const date = computed(() => series.value.date ?? []);
const isPlaceholder = computed(() => !isNumber(date.value[0]) || !isNumber(date.value[1]));
</script>

<style scoped lang="scss">
@use './metadata.scss' as *;

.detail-date {
	@include metadata-item;
}

.placeholder {
	@include metadata-placeholder;
}
</style>
