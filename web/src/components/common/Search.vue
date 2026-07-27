<template>
	<div>
		<el-input
			class="search"
			placeholder="搜索"
			v-model="keyword"
			@keydown.enter="handleSearch"
			@input="input"
			@compositionstart="status.onComposing()"
			@compositionend="status.offComposing()"
		></el-input>
	</div>
</template>

<script setup lang="ts">
import router from '@/router';
import { debounce } from '@wang-yige/utils';
import { WebRoute } from '~routes/web';

const status = useVueStatusRef('composing');
const keyword = ref('');

async function toSearch() {
	if (router.currentRoute.value.name !== WebRoute.INDEX) {
		await router.push({ name: WebRoute.INDEX, query: { keyword: keyword.value } });
	} else {
		await router.replace({ query: { keyword: keyword.value } });
	}
}

const debounceSearch = debounce(toSearch, 300);

async function handleSearch() {
	debounceSearch();
}

function input() {
	if (status.composing) {
		return;
	}
	handleSearch();
}
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.search {
	--el-input-border-radius: var(--el-component-size);
	width: 450px;
}
</style>
