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
