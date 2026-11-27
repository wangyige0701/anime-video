<template>
	<div class="index-list">
		<template v-for="segment in segments" :key="segment.key">
			<!-- 按上线时间排序时，每个月插入一条通栏分割线 -->
			<div v-if="segment.type === 'divider'" class="divider">
				<span class="label">{{ segment.label }}</span>
				<span class="line"></span>
				<span class="count">{{ segment.count }} 部</span>
			</div>
			<!-- 卡片抽成 SeriesCard，首页与搜索页共用同一套模板与样式 -->
			<SeriesCard v-else class="item" :series="segment.series" :replace="props.replace" />
		</template>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { endReachedEmitter } from '@/events/end-reached';
import { refreshEmitter } from '@/events/refresh';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { applySeriesQuery, groupSeriesByMonth } from '@/utils/seriesQuery';
import { excludeMergedMembers } from '@/utils/seriesMerge';

/** 列表渲染片段：分割线或单个系列卡片 */
type ListSegment =
	| { type: 'item'; key: string; series: Series }
	| { type: 'divider'; key: string; label: string; count: number };

const props = withDefaults(
	defineProps<{
		pageSize?: number;
		/** 关键词，首页为空；搜索页由路由参数传入 */
		keyword?: string;
		/** 跳转详情时是否替换历史记录，搜索结果页需要开启 */
		replace?: boolean;
	}>(),
	{
		pageSize: 20,
		keyword: '',
		replace: false,
	},
);

const filter = useIndexFilterStore();
const status = useVueStatusRef('loading', 'over');
const datas = shallowReactive<Series[]>([]);
const page = ref(1);
/** 已生效的关键词，随 props 变化重新加载 */
const keyword = ref(props.keyword);
/** 请求版本号，用于丢弃过期响应（切换过滤条件或搜索词时可能并发） */
let requestVersion = 0;

/**
 * 渲染片段。
 *
 * 按上线时间排序时用分组结果展开成「分割线 + 该月卡片」，
 * 分组函数保证同月内部仍按名称升序，因此这里不需要再排序。
 */
const segments = computed<ListSegment[]>(() => {
	const list = [...datas];
	if (filter.sortMode !== 'date') {
		return list.map((series) => ({ type: 'item', key: series.id, series }));
	}
	return groupSeriesByMonth(list).flatMap((group) => {
		const divider: ListSegment = {
			type: 'divider',
			key: `divider-${group.key || 'empty'}`,
			label: group.label,
			count: group.items.length,
		};
		return [divider, ...group.items.map((series): ListSegment => ({ type: 'item', key: series.id, series }))];
	});
});

// 搜索页的关键词来自路由参数，变化后从第一页重新加载
watch(
	() => props.keyword,
	(value) => {
		keyword.value = value;
		void reload();
	},
	{ flush: 'post' },
);

// 过滤或排序条件变化后从第一页重新加载
watch(
	() => filter.signature,
	() => {
		void reload();
	},
);

endReachedEmitter.on('endReached', (event) => {
	if (status.over || status.loading) {
		return;
	}
	if (event.direction !== 'bottom') {
		return;
	}
	page.value++;
	void load(false);
});

/**
 * 全量刷新后重新计算已加载页数内的数据。
 *
 * 刷新事件给出的是完整未过滤列表，必须按当前条件重新过滤排序后再截取，
 * 否则会把不符合过滤条件的系列塞回列表。
 */
refreshEmitter.on('series', (series) => {
	// 全量刷新给的是未过滤列表，被合并的系列在这里同样要剔除，
	// 否则刚合并完的成员会立即被刷新事件重新塞回列表。
	const list = applySeriesQuery(excludeMergedMembers(series), keyword.value, filter.query);
	const shown = list.slice(0, page.value * props.pageSize);
	datas.splice(0, datas.length, ...shown);
	// 刷新后可能出现新的可加载数据，解除「已加载完」标记
	if (shown.length < list.length) {
		status.offOver();
	}
});

/** 重置页码并从第一页重新加载 */
async function reload() {
	page.value = 1;
	await load(true);
}

/**
 * 加载指定页。
 *
 * @param reset 是否清空已加载数据（过滤条件变化时使用）
 */
async function load(reset: boolean) {
	const version = ++requestVersion;
	status.onLoading();
	try {
		await filter.initialize();
		const data = await useVideoStore().pagination(page.value, props.pageSize, keyword.value, filter.query);
		if (version !== requestVersion) {
			return;
		}
		if (reset) {
			datas.length = 0;
		}
		if (!data.length) {
			status.onOver();
		} else {
			datas.push(...data);
		}
	} catch (error) {}
	if (version === requestVersion) {
		status.offLoading();
	}
}

onBeforeMount(() => {
	void load(true);
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.index-list {
	--count: 8;
	display: grid;
	grid-template-columns: repeat(var(--count), 1fr);
	column-gap: token.$main-padding;
	row-gap: calc(#{token.$main-padding} - 1rem);
	@media (min-width: 1921px) {
		--count: 10;
	}
	@media (max-width: 1720px) {
		--count: 7;
	}
	@media (max-width: 1520px) {
		--count: 6;
	}
	@media (max-width: 1320px) {
		--count: 5;
	}
	@media (max-width: 1120px) {
		--count: 4;
	}
	@media (max-width: 920px) {
		--count: 3;
	}
	@media (max-width: 768px) {
		--count: 2;
	}
}

// 时间分割线占满整行，不参与栅格分栏
.divider {
	grid-column: 1 / -1;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 12px;
	padding: 4px 2px;
	.label {
		font-size: 0.8125rem;
		line-height: 1;
		// 分割线是分组提示，但要保证在深色背景上能直接读到，取主色偏亮的中间梯度
		color: map.get(token.$theme, 'l-6');
	}
	.line {
		flex: 1;
		height: 1px;
		// 之前用 d-3 比背景更暗，几乎融进背景；改用亮于背景的主题梯度，细线也能看清
		background-color: map.get(token.$theme, 'l-5');
	}
	.count {
		font-size: 0.6875rem;
		line-height: 1;
		color: map.get(token.$theme, 'l-5');
	}
}
</style>
