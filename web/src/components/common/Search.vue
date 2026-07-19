<template>
	<div>
		<el-input class="search" placeholder="搜索" v-model="keyword"></el-input>
	</div>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';

const props = defineProps<{
	keyword?: string;
}>();
const emit = defineEmits<{
	(e: 'update:keyword', value: string): void;
}>();

const keyword = useVModel(props, 'keyword', emit);
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.search {
	--el-input-border-radius: var(--el-component-size);
	width: 450px;
}
</style>
