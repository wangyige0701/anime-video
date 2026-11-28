<template>
	<Transition name="back-to-top">
		<button
			v-if="props.visible"
			class="back-to-top"
			type="button"
			title="回到顶部"
			aria-label="回到顶部"
			@click="emit('click')"
		>
			<el-icon :size="18"><Top /></el-icon>
		</button>
	</Transition>
</template>

<script setup lang="ts">
import { Top } from '@element-plus/icons-vue';

/**
 * 回到顶部的悬浮按钮。
 *
 * 只负责显示与触发，滚动容器与滚动行为由 `App.vue` 决定：
 * 主滚动区是常驻的 `el-scrollbar`，不是 window。
 */
const props = defineProps<{
	/** 滚动超过阈值后显示，避免在页面顶部时还占着一块位置 */
	visible: boolean;
}>();

const emit = defineEmits<{
	click: [];
}>();
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.back-to-top {
	position: fixed;
	right: 28px;
	/**
	 * 首页底部有一条高 62px、距底 5px 的过滤操作栏（`views/index.vue` 的 `--filter-bar-height`），
	 * 这里从 88px 起，留出 21px 间距，任何宽度下都不会压到它。
	 */
	bottom: 88px;
	z-index: 900;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 42px;
	height: 42px;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background-color: map.get(token.$theme, 'd-2');
	color: map.get(token.$theme, 'l-9');
	box-shadow:
		0 0 0 1px map.get(token.$theme, 'primary'),
		0 6px 16px map.get(token.$theme, 'd-3');
	cursor: pointer;
	transition:
		background-color 0.2s ease,
		box-shadow 0.2s ease;

	&:hover {
		background-color: map.get(token.$theme, 'd-1');
	}

	&:focus-visible {
		outline: 2px solid map.get(token.$theme, 'l-8');
		outline-offset: 2px;
	}
}

.back-to-top-enter-active,
.back-to-top-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
	opacity: 0;
	transform: translateY(8px);
}
</style>
