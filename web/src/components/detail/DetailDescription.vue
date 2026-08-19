<template>
	<div class="description">
		<TextEditor
			:value="props.series.description"
			:loading="status.modifyDescription"
			:disabled="props.disabled"
			@blur="endEditDescription"
		/>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';

const props = defineProps<{
	series: Series;
	disabled: boolean;
}>();

const status = useVueStatusRef('modifyDescription');

async function endEditDescription(value: string) {
	if (!value) {
		ElMessage.error('描述不能为空');
		return;
	}
	status.onModifyDescription();
	await props.series.updateDescription(value);
	status.offModifyDescription();
}
</script>
