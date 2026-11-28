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
			v-model:visible="panelVisible"
			trigger="click"
			placement="bottom-end"
			:width="280"
			popper-class="series-merge-popper"
		>
			<template #reference>
				<!--
					只给数字看不出含义：常态是「叠层图标 + 数字」，悬停时原地展开成「已合并 N 个系列」。
					不用 el-tooltip：套在 popover 的 reference 里会吃掉 click，成员面板打不开（实测）。
					也不用自绘浮层：角标贴着卡片右边缘，浮层向左会溢出卡片、压到相邻项。
					面板打开期间钉住展开态：鼠标移进面板后角标不再收到 hover，否则会中途缩回去。
				-->
				<button
					type="button"
					class="merge-badge"
					:class="{ 'is-pinned': panelVisible }"
					data-no-drag
					:aria-label="`已合并 ${members.length} 个系列，点击查看成员`"
					:aria-expanded="panelVisible"
				>
					<el-icon class="merge-icon"><Files /></el-icon>
					<span class="merge-count">{{ members.length }}</span>
					<span class="merge-label">已合并 {{ members.length }} 个系列</span>
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
import { Files } from '@element-plus/icons-vue';
import { getMergeCovers, MERGE_STACK_LIMIT } from '@/utils/seriesMerge';
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

/**
 * 卡片封面与叠层首图。
 *
 * 都按合并组的**最终图片顺序**取，而不是各自的 `images[0]`：用户在详情页把成员图片
 * 拖到最前面时，首图可能来自成员系列，卡片必须跟着换。
 */
const mergeCovers = computed(() => getMergeCovers(props.series, props.members));

/** 封面取整组顺序的第一张；没有合并时等价于自己的第一张 */
const cover = computed(() => coverUrl(mergeCovers.value.cover));

/**
 * 成员面板是否打开。
 *
 * 角标的展开态原来只靠 CSS `:hover`。面板是 teleport 到 body 的独立弹层，
 * 鼠标移进面板后角标就失去 hover，文字会缩回数字——用户还在看面板，角标却已经收起。
 * 因此把展开态拆成「悬停」与「面板打开」两个来源，任一成立就展开。
 */
const panelVisible = ref(false);

/** 叠层每层是该系列在最终顺序里的首图，最多三层；无图的成员保留空串占位 */
const stackImages = computed(() =>
	props.members.slice(0, MERGE_STACK_LIMIT).map((member) => coverUrl(mergeCovers.value.covers[member.id])),
);

function coverUrl(image: string | undefined) {
	return image ? getSeriesCoverUrl({ images: [image] }) : '';
}

function coverOf(member: Series) {
	return coverUrl(mergeCovers.value.covers[member.id]);
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
		transition:
			box-shadow 0.3s ease,
			transform 0.3s ease;
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
		color: map.get(token.$theme, 'l-8');
		transition: color 0.3s ease;
	}
	/**
	 * 悬停反馈。
	 *
	 * 原来叠了三层 `l-5 / l-9` 的模糊阴影，在暗色主题下就是一圈白光晕，
	 * 海报边界被糊掉、和页面底色也打架。改成「主题色细描边 + 中性深投影」：
	 * 描边负责勾出边界（任意主题自动跟随），投影只负责让卡片浮起来，不带颜色。
	 */
	&:hover {
		.img-wrap {
			transform: translateY(-2px);
			// 描边取 l-6（主题提亮两档）而不是 primary：深蓝、深绿这类主题的 primary
			// 与页面底色几乎同色，75% 透明后完全看不出边界
			box-shadow:
				0 0 0 1px map.get(token.$theme, 'l-6'),
				0 16px 32px -12px rgba(0, 0, 0, 0.75);
		}
		.img {
			transform: scale(1.06);
		}
		.name-text {
			color: map.get(token.$theme, 'l-9');
		}
		// 叠层再退开几像素，暗示下面确实还压着卡片
		.stack {
			transform: translate(-3px, -3px);
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
	transition: transform 0.3s ease;
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
			0 0 24px rgba(0, 0, 0, 0.55);
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

/**
 * 合并角标。
 *
 * 只有数字时用户看不出这代表什么，补一个「叠层」图标 + 悬浮说明。
 * 海报底色不可控（可能整张偏亮或偏紫），所以用深色描边 + 投影压出边界，
 * 否则角标会「融进」图里；悬停时外扩一圈主题色光环，明确它是可点的控件。
 */
.merge-badge {
	position: absolute;
	top: 6px;
	right: 6px;
	z-index: 40;
	display: inline-flex;
	align-items: center;
	gap: 3px;
	height: 22px;
	padding: 0 7px 0 6px;
	border: 0;
	border-radius: 11px;
	// 窄屏下卡片可能只有一百来像素，展开的文字不能把角标顶出海报
	max-width: calc(100% - 12px);
	// 底色比主题色提亮一档：纯 primary 在深蓝/深绿主题下与海报同族，角标会糊进图里
	background: color-mix(in srgb, var(--theme) 86%, #fff);
	color: map.get(token.$theme, 'l-9');
	font-size: 0.6875rem;
	font-weight: 500;
	line-height: 1;
	cursor: pointer;
	// 三层边界：深色外描边压出轮廓、投影拉开距离、内侧白高光做出凸起感。
	// 只有主题色底时，深蓝/深绿主题下角标会和同色系海报融成一片。
	box-shadow:
		0 0 0 1.5px rgba(0, 0, 0, 0.5),
		0 2px 10px rgba(0, 0, 0, 0.55),
		inset 0 0 0 1px rgba(255, 255, 255, 0.25);
	transition:
		transform 0.15s ease,
		background-color 0.15s ease,
		box-shadow 0.15s ease;

	// 展开态有两个来源：指针悬停，或成员面板正打开（此时指针已移进弹层）
	&:hover,
	&.is-pinned {
		transform: scale(1.06);
		// 悬停时底色整体提亮一档，比加一圈浅色光环更稳，也不受海报底色影响
		background: color-mix(in srgb, var(--theme) 72%, #fff);
		box-shadow:
			0 0 0 1.5px rgba(0, 0, 0, 0.5),
			0 0 0 4px color-mix(in srgb, var(--theme) 32%, transparent),
			0 4px 12px rgba(0, 0, 0, 0.6),
			inset 0 0 0 1px rgba(255, 255, 255, 0.3);

		.merge-count {
			max-width: 0;
			opacity: 0;
		}

		.merge-label {
			max-width: 120px;
			opacity: 1;
		}
	}
}

.merge-icon {
	font-size: 0.75rem;
}

.merge-count,
.merge-label {
	display: inline-block;
	overflow: hidden;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
	transition:
		max-width 0.2s ease,
		opacity 0.15s ease;
}

.merge-count {
	max-width: 1.6em;
	opacity: 1;
}

// 悬停展开的说明文字：靠 max-width 过渡，宽度为 0 时不占位
.merge-label {
	max-width: 0;
	opacity: 0;
	text-overflow: ellipsis;
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
