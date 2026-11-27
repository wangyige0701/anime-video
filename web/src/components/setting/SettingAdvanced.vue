<template>
	<el-collapse class="advanced">
		<el-collapse-item title="高级" name="advanced">
			<div class="body">
				<slot />
			</div>
		</el-collapse-item>
	</el-collapse>
</template>

<script setup lang="ts">
/**
 * 分组内的高级项折叠。
 *
 * Element Plus 的折叠面板默认是浅色主题，这里只覆盖必要的 CSS 变量，
 * 不重写组件内部结构，避免与详情页的折叠面板维护两套样式。
 */
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.advanced {
	border-top: 0;
	border-bottom: 0;
	--el-collapse-border-color: #{map.get(token.$theme, 'l-4')};
	--el-collapse-header-bg-color: transparent;
	--el-collapse-content-bg-color: transparent;
	--el-collapse-header-text-color: #{map.get(token.$theme, 'l-7')};
	--el-collapse-content-text-color: #{token.$text-color-primary};

	:deep(.el-collapse-item__header) {
		padding-left: 0;
		font-size: 0.8125rem;
	}

	:deep(.el-collapse-item__content) {
		padding-bottom: 0;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
}
</style>
