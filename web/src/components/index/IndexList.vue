<template>
	<div class="index-list">
		<template v-for="item in datas" :key="item.id">
			<router-link class="item" :to="{ name: WebRoute.DETAIL, params: { seriesId: item.id, name: item.name } }">
				<div class="img-wrap">
					<el-image
						class="img"
						:src="getImageUrl(getSeriesPath(item.images[0] ?? ''))"
						fit="cover"
					></el-image>
				</div>
				<div class="name">
					<el-tooltip :content="item.name" placement="bottom">
						<span class="name-text">{{ item.name }}</span>
					</el-tooltip>
				</div>
			</router-link>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { endReachedEmitter } from '@/events/end-reached';
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';

const props = withDefaults(
	defineProps<{
		pageSize?: number;
	}>(),
	{
		pageSize: 20,
	},
);

const route = useRoute();
const status = useVueStatusRef('loading', 'over');
const datas = shallowReactive<Series[]>([]);
const page = ref(1);
const keyword = ref<string>((route.query.keyword as string) || '');

watch(
	() => route.query.keyword,
	(newValue) => {
		keyword.value = newValue as string;
		datas.length = 0;
		page.value = 1;
		getData();
	},
	{ flush: 'post' },
);

endReachedEmitter.on('endReached', (event) => {
	if (status.over || status.loading) {
		return;
	}
	if (event.direction !== 'bottom') {
		return;
	}
	page.value++;
	getData();
});

async function getData() {
	status.onLoading();
	try {
		const data = await useVideoStore().pagination(page.value, props.pageSize, keyword.value);
		if (!data.length) {
			status.onOver();
		} else {
			datas.push(...data);
		}
	} catch (error) {}
	status.offLoading();
}

onBeforeMount(() => {
	getData();
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
