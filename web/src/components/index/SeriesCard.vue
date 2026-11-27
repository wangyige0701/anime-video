<template>
	<div
		class="series-card"
		:class="{ dragging: props.dragging, 'drop-target': props.dropTarget }"
		:data-series-id="props.series.id"
	>
		<!-- 叠层在卡片背后，只显示被合并系列的首图；指针事件全部穿透，命中检测始终落在卡片上 -->
		<div v-if="stackImages.length || props.dropTarget" class="stack">
			<div v-for="(image, index) in stackImages" :key="index" class="stack-layer" :style="layerStyle(index)">
				<img v-if="image" :src="image" alt="" draggable="false" />
			</div>
			<!-- 拖入反馈：目标卡片上滑出一层，暗示松手后会叠进这里 -->
			<div v-if="props.dropTarget" class="stack-layer incoming"></div>
		</div>

		<router-link
			class="link"
			:to="{ name: WebRoute.DETAIL, params: { seriesId: props.series.id, name: props.series.name } }"
			:replace="props.replace"
		>
			<div class="img-wrap" data-drag-visual>
				<el-image class="img" :src="cover" fit="cover"></el-image>
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

		<!-- 合并角标与成员面板：脱离入口放在这里，卡片主体仍然只负责跳转 -->
		<el-popover
			v-if="members.length"
			trigger="click"
			placement="bottom-end"
			:width="280"
			popper-class="series-merge-popper"
		>
			<template #reference>
				<button type="button" class="merge-badge" data-no-drag :title="`已合并 ${members.length} 个系列`">
					{{ members.length }}
				</button>
			</template>
			<div class="merge-panel">
				<div class="merge-panel-title">已合并 {{ members.length }} 个系列</div>
				<div v-for="member in members" :key="member.id" class="merge-member">
					<img class="member-cover" :src="coverOf(member)" alt="" />
					<span class="member-title" :title="member.title">{{ member.title }}</span>
					<button type="button" class="member-detach" data-no-drag @click.stop="detach(member.id)">
						脱离
					</button>
				</div>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { getMergeStack } from '@/utils/seriesMerge';
import { getSeriesCoverUrl } from '@/utils/series';
import { WebRoute } from '~shared/web-route-config';

/**
 * 视频系列卡片。
 *
 * 首页与搜索页展示的是同一种卡片，抽成独立组件后两处复用，
 * 避免为了「跳转时是否替换历史记录」再复制一份模板。
 *
 * 合并关系建立后，卡片背后按 `members` 顺序叠出最多三层首图；
 * 角标点开是成员面板，脱离操作只改主系列，成员立即恢复为独立卡片。
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
		/** 已合并进当前系列的成员，顺序与主系列记录的成员顺序一致 */
		members?: Series[];
		/** 当前卡片正在被拖拽 */
		dragging?: boolean;
		/** 当前卡片是拖拽的合法落点 */
		dropTarget?: boolean;
	}>(),
	{
		replace: false,
		members: () => [],
		dragging: false,
		dropTarget: false,
	},
);

const emit = defineEmits<{
	(e: 'detach', memberId: string): void;
}>();

const cover = computed(() => getSeriesCoverUrl(props.series));

/** 叠层把图片路径转成可直接渲染的地址，没有首图的成员保留空串占位 */
const stackImages = computed(() => {
	return getMergeStack(props.members).images.map((image) => (image ? getSeriesCoverUrl({ images: [image] }) : ''));
});

function coverOf(member: Series) {
	return getSeriesCoverUrl(member);
}

/**
 * 由近到远逐层偏移，越远越靠上，形成一叠卡片。
 *
 * 横向偏移大于纵向：横向吃掉的是栅格列间距，纵向偏移过大会压到上一行的标题。
 */
const STACK_OFFSETS = [
	{ x: -8, y: -6 },
	{ x: -16, y: -12 },
	{ x: -24, y: -18 },
];

function layerStyle(index: number) {
	const offset = STACK_OFFSETS[Math.min(index, STACK_OFFSETS.length - 1)]!;
	return {
		transform: `translate(${offset.x}px, ${offset.y}px)`,
		zIndex: 20 - index,
	};
}

function detach(memberId: string) {
	emit('detach', memberId);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/image.scss' as image;

.series-card {
	position: relative;
	display: block;
	width: 100%;
	min-width: 0;
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;

	// 正在被拖拽的卡片留一个淡影，表示它此刻是浮层的来源
	&.dragging {
		opacity: 0.35;
		transform: scale(0.96);
	}

	.link {
		position: relative;
		z-index: 10;
		display: block;
		cursor: pointer;
	}

	.img-wrap {
		@include image.image-wrap;
		transition: box-shadow 0.3s ease;
		// el-image 最终渲染的是原生 <img>，不关掉原生拖拽会吞掉拖拽合并后续的 pointermove
		:deep(img) {
			-webkit-user-drag: none;
			user-select: none;
		}
	}
	.img {
		@include image.image;
		transition: transform 0.3s ease;
		// 容器的 user-select 会继承给内部 img；原生拖拽由上面的 :deep(img) 关掉，
		// 在这里写 -webkit-user-drag 对 el-image 根节点无效
		user-select: none;
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

// 与 .img-wrap 使用同一个宽高比，偏移后的叠层才能和海报严格对齐
.stack {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	padding-top: token.$image-radio;
	z-index: 0;
	pointer-events: none;
}

.stack-layer {
	position: absolute;
	inset: 0;
	overflow: hidden;
	border-radius: 10px;
	background: map.get(token.$theme, 'd-9');
	// 亮描边让每一层的边界清晰，否则多张暗色海报叠在一起看不出层数
	box-shadow: 0 0 0 1px map.get(token.$theme, 'l-3');
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		// 叠层是背景信息，压暗后才不会和主卡片抢视觉
		filter: brightness(0.62) saturate(0.85);
	}
}

// 拖入时从远处滑进来的一层，用主题色渐变代表「待合并的卡片」
.incoming {
	background: linear-gradient(135deg, map.get(token.$theme, 'd-7'), map.get(token.$theme, 'primary'));
	opacity: 0;
	animation: stack-suck 0.45s ease-out forwards;
}

@keyframes stack-suck {
	from {
		transform: translate(-36px, -28px) scale(0.9);
		opacity: 0;
	}
	to {
		transform: translate(-24px, -18px) scale(1);
		opacity: 0.85;
	}
}

.drop-target {
	.img-wrap {
		animation: target-breathe 0.7s ease-in-out infinite alternate;
		box-shadow:
			0 0 0 2px map.get(token.$theme, 'primary'),
			0 0 18px 2px map.get(token.$theme, 'l-5');
	}
	// 整个卡片都是落点，用虚线框把可投放区域说清楚
	&::after {
		content: '';
		position: absolute;
		inset: -6px;
		border: 2px dashed map.get(token.$theme, 'primary');
		border-radius: 14px;
		pointer-events: none;
		z-index: 30;
	}
}

@keyframes target-breathe {
	from {
		transform: scale(1);
	}
	to {
		transform: scale(1.04);
	}
}

.merge-badge {
	position: absolute;
	top: 6px;
	right: 6px;
	z-index: 40;
	min-width: 20px;
	height: 20px;
	padding: 0 6px;
	border: 0;
	border-radius: 10px;
	background: map.get(token.$theme, 'primary');
	color: map.get(token.$theme, 'l-9');
	font-size: 0.6875rem;
	line-height: 20px;
	text-align: center;
	cursor: pointer;
	box-shadow: 0 2px 6px map.get(token.$theme, 'd-8');
	transition: transform 0.15s ease;
	&:hover {
		transform: scale(1.1);
	}
}

.merge-panel-title {
	color: token.$text-color-secondary;
	font-size: 0.75rem;
	padding-bottom: 8px;
	margin-bottom: 8px;
	border-bottom: 1px solid map.get(token.$theme, 'd-7');
}

.merge-member {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
}

.member-cover {
	width: 28px;
	height: 38px;
	object-fit: cover;
	border-radius: 4px;
	flex: none;
	background: map.get(token.$theme, 'd-8');
}

.member-title {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: token.$text-color-regular;
	font-size: 0.8125rem;
}

.member-detach {
	flex: none;
	padding: 2px 8px;
	border: 1px solid map.get(token.$theme, 'd-6');
	border-radius: 4px;
	background: transparent;
	color: token.$text-color-secondary;
	font-size: 0.75rem;
	cursor: pointer;
	transition:
		color 0.2s ease,
		border-color 0.2s ease;
	&:hover {
		color: map.get(token.$theme, 'primary');
		border-color: map.get(token.$theme, 'primary');
	}
}
</style>

<style lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

/**
 * 成员面板是 teleport 到 body 的弹层，不能用 scoped 样式命中，
 * 这里沿用详情页弹层的做法：按 popper-class 覆盖 Element Plus 的默认亮色。
 *
 * 同时设置 CSS 变量而不只是 background，弹层的小箭头才会跟着换色。
 */
body .el-popover.el-popper.series-merge-popper {
	--el-popover-bg-color: #{map.get(token.$theme, 'd-5')};
	--el-popover-border-color: #{map.get(token.$theme, 'l-3')};
	padding: 10px;
	border-color: var(--el-popover-border-color);
	background: var(--el-popover-bg-color);
	box-shadow: 0 0 10px map.get(token.$theme, 'd-4');
	// 小箭头默认取 el-bg-color（亮色），不跟着弹层变量走，必须单独覆盖
	.el-popper__arrow::before {
		background: var(--el-popover-bg-color);
		border-color: var(--el-popover-border-color);
	}
}
</style>
