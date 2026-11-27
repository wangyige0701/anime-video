<template>
	<div class="advanced" :class="{ open: status.open }">
		<button type="button" class="toggle" :aria-expanded="status.open" @click="status.toggleOpen()">
			<span class="title">{{ props.title }}</span>
			<el-icon class="chevron"><ArrowRight /></el-icon>
			<span v-if="props.summary" class="summary">{{ props.summary }}</span>
		</button>
		<el-collapse-transition>
			<div v-show="status.open" class="body">
				<slot></slot>
			</div>
		</el-collapse-transition>
	</div>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';

/**
 * 分组内的进阶参数折叠。
 *
 * 用原生 button 而不是 el-collapse：后者在深色面板里是一条通栏横线，
 * 没有 hover 反馈、箭头也不会转，看不出可点。这里整行可点、hover 提亮、
 * 箭头旋转、内容用 Element 的折叠过渡展开，键盘与读屏都能识别状态。
 */
const props = withDefaults(
	defineProps<{
		title?: string;
		/** 收起时显示的摘要，例如「代理 · 超时」 */
		summary?: string;
	}>(),
	{ title: '高级参数' },
);

const status = useVueStatusRef('open');
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.advanced {
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	margin-top: 2px;
}

.toggle {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 12px 0;
	border: 0;
	background: none;

	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-8'));

	text-align: left;
	cursor: pointer;
	transition: color 0.18s ease;

	&:hover {
		color: #fff;

		.chevron {
			background-color: rgba(255, 255, 255, 0.1);
		}
	}

	&:focus-visible {
		outline: none;

		.chevron {
			box-shadow: 0 0 0 2px map.get(token.$theme, 'l-7');
		}
	}
}

.chevron {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: 50%;

	@include text.text(11px, 1, currentColor);

	transition:
		transform 0.2s ease,
		background-color 0.18s ease;
}

.open .chevron {
	transform: rotate(90deg);
}

.title {
	font-weight: 500;
}

.summary {
	margin-left: auto;

	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
}

.body {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 4px 0 16px;
}
</style>
