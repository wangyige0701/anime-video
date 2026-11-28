<template>
	<div class="index">
		<div class="list">
			<IndexList :page-size="40" />
		</div>
		<div class="filter">
			<IndexFilterBar />
		</div>
	</div>
</template>

<script setup lang="ts">
import { WebRoute } from '~shared/web-route-config';

/**
 * 组件名必须与 `App.vue` 里 `<keep-alive :include="[WebRoute.INDEX]">` 一致。
 *
 * `<script setup>` 不做声明时用的是文件名推断出的 `index`，与 `Index` 只差大小写，
 * `include` 是严格比较，于是首页根本没被缓存：从详情页后退时列表重建、分页回到第一页，
 * 已加载的页数与滚动位置一起丢掉。
 */
defineOptions({ name: WebRoute.INDEX });

definePage({
	name: 'Index',
	meta: {
		title: '动画管理服务',
	},
});
</script>

<style scoped lang="scss">
.index {
	// 过滤栏需要容纳两个分段选择器上方的标签文案，高度比只放控件时更高
	--filter-bar-height: 62px;
	--filter-bar-gap: 5px;
	width: 100%;
	flex: 1;
	display: flex;
	flex-direction: column;
}

// 过滤栏贴在滚动容器底部，列表再长也不需要滚到末尾才能操作过滤
.list {
	flex: 1;
	padding-bottom: 10px;
}

.filter {
	position: sticky;
	bottom: var(--filter-bar-gap);
	width: 100%;
	height: var(--filter-bar-height);
	// 必须高于卡片内部的所有层级（`.link` 10、`.drop-target::after` 30、`.merge-badge` 40）：
	// 这些 z-index 挂在 `.series-card`（未建立层叠上下文）的子元素上，会与外层直接比较，
	// 过滤栏只给 2 时会被滚到底部的卡片整块盖住。低于拖拽浮层（2600）与弹层。
	z-index: 100;
}
</style>
