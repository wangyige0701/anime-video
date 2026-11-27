<template>
	<div class="field">
		<span class="label">{{ props.label }}</span>
		<div class="control">
			<slot></slot>
		</div>
		<p v-if="props.hint" class="hint">{{ props.hint }}</p>
	</div>
</template>

<script setup lang="ts">
/**
 * 设置页的一行：左侧窄标签，右侧控件，说明文字落在控件下方。
 *
 * 标签列固定 116px：设置项的 label 都是短词，再宽就是一列空白；
 * 说明给控件列整行宽度，长句不会把输入框挤窄，也不会撑高标签列。
 */
const props = defineProps<{
	label: string;
	hint?: string;
}>();
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.field {
	display: grid;
	grid-template-columns: 116px minmax(0, 1fr);
	gap: 4px 20px;
	align-items: center;
}

.label {
	grid-column: 1;
	grid-row: 1;

	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-9'));
}

.control {
	display: flex;
	grid-column: 2;
	grid-row: 1;
	align-items: center;
	gap: 8px;
	max-width: 380px;
	min-width: 0;

	:deep(.el-input) {
		flex: 1;
		min-width: 0;
	}

	// 数字框是定宽控件，跟着输入框撑满整行会让 5 位数字占掉半个面板
	:deep(.el-input-number) {
		flex: 0 0 auto;
		min-width: 0;
	}
}

.hint {
	grid-column: 2;
	grid-row: 2;
	margin: 0;

	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
}

@media (max-width: 720px) {
	.field {
		grid-template-columns: minmax(0, 1fr);
		align-items: stretch;
	}

	.label,
	.control,
	.hint {
		grid-column: 1;
		grid-row: auto;
	}
}
</style>
