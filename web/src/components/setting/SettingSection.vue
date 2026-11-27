<template>
	<section class="card" v-loading="loading">
		<header class="card-head">
			<div class="card-title">
				<h2>{{ title }}</h2>
				<span class="status" :class="configured ? 'ok' : 'off'">
					<i class="dot"></i>
					{{ configured ? '已配置' : '未配置' }}
				</span>
			</div>
			<p v-if="hint" class="card-hint">{{ hint }}</p>
		</header>

		<div class="fields">
			<slot></slot>
		</div>

		<footer v-if="$slots.footer" class="actions">
			<slot name="footer"></slot>
		</footer>
	</section>
</template>

<script setup lang="ts">
/** 设置分组的卡片外壳：标题、可用状态、说明、字段区与底部操作区 */
defineProps<{
	title: string;
	hint?: string;
	configured: boolean;
	loading?: boolean;
}>();
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

// 与详情页的元数据面板同一层视觉：深色半透明底 + 主题描边，避免在渐变背景上「浮着」
.card {
	background-color: map.get(token.$theme, 'detail-metadata-bg');
	border: 1px solid map.get(token.$theme, 'l-2');
	border-radius: token.$radius-lg;
	padding: 20px 22px;
}

.card-head {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 14px;
}

.card-title {
	display: flex;
	align-items: center;
	gap: 10px;

	h2 {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 600;
		color: token.$text-color-primary;

		// 分组标题的小竖条：让两个分组在同一列里有明确的视觉起点
		&::before {
			content: '';
			width: 3px;
			height: 14px;
			border-radius: 2px;
			background-color: map.get(token.$theme, 'l-7');
		}
	}
}

.card-hint {
	margin: 0;
	font-size: 0.8125rem;
	line-height: 1.6;
	color: map.get(token.$theme, 'l-7');
}

.fields {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

/**
 * 可用状态标签。
 *
 * 不用 el-tag：它在深色主题下是浅底深字的一块亮砖。这里用低透明度底色 + 同色描边，
 * 未配置取中性白、已配置取 Element 的成功色（#67c23a 的透明叠加），两种主题梯度下都不刺眼。
 */
.status {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 9px;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.14);
	background-color: rgba(255, 255, 255, 0.06);
	font-size: 0.75rem;
	line-height: 1.4;
	color: map.get(token.$theme, 'l-8');

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: currentColor;
	}

	&.ok {
		color: #8fd67a;
		border-color: rgba(103, 194, 58, 0.42);
		background-color: rgba(103, 194, 58, 0.16);
	}
}

// 折叠面板自带分隔线，底部操作区不再加一条，避免两条线挤在一起
.actions {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 14px;
}
</style>
