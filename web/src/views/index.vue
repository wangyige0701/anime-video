<template>
	<div class="index">
		<div class="list">
			<IndexList :page-size="40" />
		</div>
		<div class="types"></div>
	</div>
</template>

<script setup lang="ts">
definePage({
	name: 'Index',
});
</script>

<style scoped lang="scss">
.index {
	--type-bar-height: 45px;
	--type-bar-gap: 5px;
	width: 100%;
	flex: 1;
	position: relative;
}

.list {
	height: auto;
	padding-bottom: calc(var(--type-bar-height) + var(--type-bar-gap) * 2);
}

.types {
	width: 100%;
	height: var(--type-bar-height);
	position: absolute;
	left: 0;
	bottom: 5px;
}
</style>
