<template>
	<router-link
		class="series-card"
		:to="{ name: WebRoute.DETAIL, params: { seriesId: props.series.id, name: props.series.name } }"
		:replace="props.replace"
	>
		<div class="img-wrap">
			<el-image
				class="img"
				:src="getImageUrl(getSeriesPath(props.series.images[0] ?? ''))"
				fit="cover"
			></el-image>
		</div>
		<div class="name">
			<el-tooltip
				:content="props.series.name"
				placement="bottom"
				:show-after="300"
				:hide-after="0"
				:enterable="false"
			>
				<span class="name-text">{{ props.series.name }}</span>
			</el-tooltip>
		</div>
	</router-link>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~shared/server-route-config';
import { WebRoute } from '~shared/web-route-config';

/**
 * 视频系列卡片。
 *
 * 首页与搜索页展示的是同一种卡片，抽成独立组件后两处复用，
 * 避免为了「跳转时是否替换历史记录」再复制一份模板。
 */
const props = withDefaults(
	defineProps<{
		/** 要展示的系列 */
		series: Series;
		/**
		 * 是否用 `router.replace` 跳转详情。
		 *
		 * 搜索结果页需要开启：否则从详情返回会回到搜索结果页，
		 * 而用户期望回到进入搜索之前的页面。
		 */
		replace?: boolean;
	}>(),
	{
		replace: false,
	},
);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/image.scss' as image;

.series-card {
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
