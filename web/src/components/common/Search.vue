<template>
	<div>
		<el-input
			class="search"
			placeholder="搜索"
			v-model="keyword"
			clearable
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
import { WebRoute } from '~shared/web-route-config';
import { planSearchNavigation } from '@/utils/search';

const status = useVueStatusRef('composing');
const keyword = ref('');

// 搜索页的关键词在路径参数上；直接访问、前进后退或刷新时同步回输入框
const routeKeyword = computed(() => {
	const params = router.currentRoute.value.params as Record<string, string | string[] | undefined>;
	const value = params.keyword;
	return typeof value === 'string' ? value : '';
});
watch(
	routeKeyword,
	(value) => {
		keyword.value = value;
	},
	{ immediate: true },
);

/**
 * 进入搜索结果页。
 *
 * 具体用 push 还是 replace 由 `planSearchNavigation()` 决定，
 * 组件只负责把计划翻译成路由调用。
 */
async function toSearch() {
	const plan = planSearchNavigation(router.currentRoute.value.name?.toString(), keyword.value);
	if (!plan) {
		return;
	}
	if (plan.kind === 'index') {
		await router.replace({ name: WebRoute.INDEX });
		return;
	}
	const location = { name: WebRoute.SEARCH, params: { keyword: plan.keyword } } as const;
	await (plan.replace ? router.replace(location) : router.push(location));
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
	--el-input-bg-color: #{map.get(token.$theme, 'd-3')};
	width: 450px;
}
</style>
