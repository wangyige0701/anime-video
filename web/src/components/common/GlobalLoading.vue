<template>
	<!-- 全局加载遮罩：首次数据请求与路由切换（组件分包未加载）共用同一层，避免出现两种遮罩 -->
	<Transition name="global-loading">
		<div v-if="props.visible" class="global-loading" role="status" aria-live="polite">
			<el-icon class="spinner is-loading" :size="28"><Loading /></el-icon>
			<span class="tip">{{ props.tip }}</span>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue';

/**
 * 全局加载遮罩。
 *
 * 遮罩只负责展示，显示时机由调用方决定：
 * 首屏全量数据请求（`stores/video` 的 loading）与路由切换中（`router/loading`）都会用到它。
 */
const props = withDefaults(
	defineProps<{
		/** 是否显示遮罩 */
		visible: boolean;
		/** 提示文案，说明当前在加载什么 */
		tip?: string;
	}>(),
	{
		tip: '正在加载…',
	},
);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.global-loading {
	position: fixed;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	background-color: map.get(token.$theme, 'loading-bg');
	backdrop-filter: blur(4px);
	z-index: 2000;
	.tip {
		font-size: 0.875rem;
		color: map.get(token.$theme, 'l-9');
	}
	.spinner {
		color: map.get(token.$theme, 'l-9');
	}
}

.global-loading-enter-active,
.global-loading-leave-active {
	transition: opacity 0.25s ease;
}

.global-loading-enter-from,
.global-loading-leave-to {
	opacity: 0;
}
</style>
