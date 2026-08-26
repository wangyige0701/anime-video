<template>
	<div class="description">
		<span class="title">剧情简介</span>
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

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.description {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: map.get(token.$theme, 'l-9');
	.title {
		color: map.get(token.$theme, 'l-8');
		font-size: 0.75rem;
	}
}
</style>
