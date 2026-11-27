<template>
	<section class="panel" v-loading="props.loading">
		<header class="panel-head">
			<div class="title-row">
				<h2>{{ props.title }}</h2>
				<span v-if="props.stateLabel" class="status" :class="{ ok: props.stateOk }">
					<i class="dot"></i>
					{{ props.stateLabel }}
				</span>
			</div>
			<p v-if="props.hint" class="hint">{{ props.hint }}</p>
		</header>

		<!-- 已保存配置的摘要：表单里是「编辑中」的值，这里始终反映当前生效值 -->
		<dl v-if="props.meta?.length" class="panel-meta">
			<div v-for="item in props.meta" :key="item.label" class="meta-item">
				<dt>{{ item.label }}</dt>
				<dd>{{ item.value }}</dd>
			</div>
		</dl>

		<div class="panel-body">
			<slot></slot>
		</div>

		<footer v-if="$slots.footer" class="panel-foot">
			<slot name="footer"></slot>
		</footer>
	</section>
</template>

<script setup lang="ts">
/**
 * 设置分组的卡片外壳：标题、可用状态、说明、生效值摘要、字段区与底部操作条。
 *
 * 标题、摘要与字段标签共用同一条左基线（面板内边距），
 * 头部不放图标块：图标会把标题整体右移，与下面的内容列形成两条竖线。
 *
 * 摘要与表单分开：改了输入框还没保存时，摘要仍显示服务端生效值，避免误以为已生效。
 */
const props = defineProps<{
	title: string;
	hint?: string;
	/**
	 * 可用状态文案，例如「已配置」。
	 *
	 * 不用布尔 prop 控制显隐：Vue 会把未传的 Boolean 转成 `false`，
	 * 外观、播放器这类没有可用性概念的分组会平白多出一个「未配置」标签。
	 */
	stateLabel?: string;
	stateOk?: boolean;
	meta?: Array<{ label: string; value: string }>;
	loading?: boolean;
}>();
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.panel {
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: token.$radius-ex-lg;
	background-color: rgba(0, 0, 0, 0.22);
}

.panel-head {
	padding: 18px 20px 14px;
}

.title-row {
	display: flex;
	align-items: center;
	gap: 10px;

	h2 {
		@include text.text(1rem, 1.5, token.$text-color-primary);

		margin: 0;
		font-weight: 600;
	}
}

/**
 * 可用状态。
 *
 * 不用 el-tag：深色主题下它是浅底深字的一块亮砖。这里只用一个状态点和文字，
 * 已配置用低饱和绿，未配置用中性灰，两套主题梯度下都不抢注意力。
 */
.status {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	@include text.text(0.75rem, 1, map.get(token.$theme, 'l-6'));

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: rgba(255, 255, 255, 0.3);
	}

	&.ok {
		color: #8fd67a;

		.dot {
			background-color: currentColor;
			box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.16);
		}
	}
}

.hint {
	margin: 5px 0 0;

	@include text.text(0.8125rem, 1.6, map.get(token.$theme, 'l-7'));
}

.panel-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 26px;
	margin: 0;
	// 与字段行的 label 同一条左基线，避免摘要缩进后与下面的字段错位
	padding: 0 20px 16px;
}

.meta-item {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 90px;

	// 摘要标签与值同用 1.4 行高，中英混排下行盒等高，三列才能共基线
	dt {
		@include text.text(0.6875rem, 1.4, map.get(token.$theme, 'l-6'));

		letter-spacing: 0.02em;
	}

	dd {
		@include text.text(0.8125rem, 1.4, map.get(token.$theme, 'l-9'));

		margin: 0;
		font-variant-numeric: tabular-nums;
		// 超长地址不换行，截断处保留可读前缀
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.panel-body {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 18px 20px;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-foot {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 20px;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	background-color: rgba(0, 0, 0, 0.14);
}
</style>
