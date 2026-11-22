<template>
	<div class="search">
		<div class="header">
			<span class="label">搜索关键词</span>
			<span class="keyword">{{ keyword }}</span>
		</div>
		<div class="list">
			<!-- 与首页共用列表组件：分页、月分割线、刷新同步完全一致，跳转改为替换历史 -->
			<IndexList :keyword="keyword" :page-size="40" replace />
		</div>
	</div>
</template>

<script setup lang="ts">
import { WebRoute } from '~shared/web-route-config';

definePage({
	name: 'Search',
	meta: {
		title: '搜索结果',
	},
});

/**
 * 搜索结果页。
 *
 * 关键词来自路径参数而不是查询串：地址可以直接分享与刷新，
 * 浏览器前进/后退也能还原到具体的搜索结果。
 */
const route = useRoute(WebRoute.SEARCH);
const keyword = computed(() => String(route.params.keyword ?? '').trim());

// 标题带上关键词，多标签页时能区分是哪一个搜索
watch(
	keyword,
	(value) => {
		route.meta.setTitle?.(value ? `${value} - 搜索` : '搜索结果');
	},
	{ immediate: true },
);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.search {
	width: 100%;
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding-bottom: 10px;
}

.header {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: baseline;
	gap: 8px;
	.label {
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
	}
	.keyword {
		font-size: 1.125rem;
		color: token.$text-color-primary;
		word-break: break-all;
	}
}

.list {
	flex: 1;
}
</style>
