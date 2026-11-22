<template>
	<div class="index-list">
		<template v-for="segment in segments" :key="segment.key">
			<!-- 按上线时间排序时，每个月插入一条通栏分割线 -->
			<div v-if="segment.type === 'divider'" class="divider">
				<span class="label">{{ segment.label }}</span>
				<span class="line"></span>
				<span class="count">{{ segment.count }} 部</span>
			</div>
			<router-link
				v-else
				class="item"
				:to="{ name: WebRoute.DETAIL, params: { seriesId: segment.series.id, name: segment.series.name } }"
			>
				<div class="img-wrap">
					<el-image
						class="img"
						:src="getImageUrl(getSeriesPath(segment.series.images[0] ?? ''))"
						fit="cover"
					></el-image>
				</div>
				<div class="name">
					<el-tooltip
						:content="segment.series.name"
						placement="bottom"
						:show-after="300"
						:hide-after="0"
						:enterable="false"
					>
						<span class="name-text">{{ segment.series.name }}</span>
					</el-tooltip>
				</div>
			</router-link>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { endReachedEmitter } from '@/events/end-reached';
import { refreshEmitter } from '@/events/refresh';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { applySeriesQuery, groupSeriesByMonth } from '@/utils/seriesQuery';
import { getImageUrl } from '~shared/server-route-config';
import { WebRoute } from '~shared/web-route-config';

/** 列表渲染片段：分割线或单个系列卡片 */
type ListSegment =
	| { type: 'item'; key: string; series: Series }
	| { type: 'divider'; key: string; label: string; count: number };

const props = withDefaults(
	defineProps<{
		pageSize?: number;
	}>(),
	{
		pageSize: 20,
	},
);

const route = useRoute();
const filter = useIndexFilterStore();
const status = useVueStatusRef('loading', 'over');
const datas = shallowReactive<Series[]>([]);
const page = ref(1);
const keyword = ref<string>((route.query.keyword as string) || '');
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

watch(
	() => route.query.keyword,
	(newValue) => {
		keyword.value = (newValue as string) || '';
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
	const list = applySeriesQuery(series, keyword.value, filter.query);
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
@use '@/scss/mixin/image.scss' as image;

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
		font-size: 0.9375rem;
		line-height: 1;
		color: token.$text-color-primary;
	}
	.line {
		flex: 1;
		height: 1px;
		background-color: map.get(token.$theme, 'l-2');
	}
	.count {
		font-size: 0.75rem;
		line-height: 1;
		color: map.get(token.$theme, 'l-6');
	}
}

.item {
	cursor: pointer;
	display: block;
	width: 100%;
	min-width: 0;
	.img-wrap {
		@include image.image-wrap;
		transition: box-shadow 0.3s ease;
	}
	.img {
		@include image.image;
		transition: transform 0.3s ease;
	}
	.name {
		width: 100%;
		color: token.$text-color-regular;
		font-size: 0.875rem;
		line-height: 1;
		padding: 1em 5px;
		text-align: center;
		overflow: hidden;
	}
	.name-text {
		display: inline-block;
		width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		transition:
			filter 0.3s ease,
			color 0.3s ease;
	}
	&:hover {
		.img-wrap {
			box-shadow:
				0 0 4px 0 map.get(token.$theme, 'primary'),
				0 0 8px 0 map.get(token.$theme, 'l-5'),
				0 0 12px 0 map.get(token.$theme, 'l-9');
		}
		.img {
			transform: scale(1.1);
		}
		.name-text {
			color: token.$text-color-regular;
			filter: drop-shadow(0 0 6px map.get(token.$theme, 'l-9'));
		}
	}
}
</style>
