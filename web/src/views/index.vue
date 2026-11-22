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
	--filter-bar-height: 45px;
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
}
</style>
