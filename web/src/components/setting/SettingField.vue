<template>
	<div class="field">
		<span class="label">{{ label }}</span>
		<div class="control">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
/** 设置页的一行：固定宽度的字段名 + 自适应控件，各分组共用 */
defineProps<{ label: string }>();
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.field {
	display: flex;
	align-items: center;
	gap: 12px;

	.label {
		flex: 0 0 92px;
		font-size: 0.8125rem;
		color: map.get(token.$theme, 'l-9');
	}

	.control {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
}
</style>
