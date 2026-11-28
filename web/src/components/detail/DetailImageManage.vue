<template>
	<div class="image-manage">
		<p class="hint">
			{{ props.merged ? '拖动缩略图调整顺序，主系列与合并系列的图片一起排序。' : '拖动缩略图调整顺序。' }}
		</p>
		<el-scrollbar max-height="52vh">
			<div ref="listRef" class="grid">
				<div v-for="(image, index) in images" :key="image" class="item">
					<img class="thumb" :src="getImageUrl(getSeriesPath(image))" alt="" draggable="false" />
					<span class="order">{{ index + 1 }}</span>
				</div>
			</div>
		</el-scrollbar>
	</div>
</template>

<script setup lang="ts">
import type { DialogManager } from '@/utils/dialog';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~shared/server-route-config';
import { triggerRef } from 'vue';
import { useDraggable } from 'vue-draggable-plus';

/**
 * 图片排序面板。
 *
 * 只负责拖拽与「保存」，写入通过调用方传入的 `commit` 完成：
 * 面板挂在独立的应用里，拿不到详情页的 provide，也拿不到路由，
 * 因此合并组与非合并组的差异（提交哪个接口）由调用方决定，面板本身不判断。
 */
const props = withDefaults(
	defineProps<{
		/** 初始顺序，绝对路径（与 `series.images` 一致） */
		images: string[];
		/** 是否来自合并组，只影响提示文案 */
		merged?: boolean;
		/** 写入顺序，返回是否成功；失败时数据层已回滚，面板保持打开 */
		commit: (images: string[]) => Promise<boolean>;
		dialog: DialogManager<string[]>;
	}>(),
	{
		merged: false,
	},
);

const listRef = useTemplateRef('listRef');
const status = useVueStatusRef('saving');
/**
 * 本地顺序镜像：拖拽库原地调整数组，用 shallowRef 时必须显式 triggerRef
 * 才能让序号标签跟着重排。字符串项没有循环引用，直接原样返回即可。
 */
const images = shallowRef<string[]>([...props.images]);

useDraggable(listRef, images, {
	animation: 180,
	ghostClass: 'item-ghost',
	clone: (image) => image,
	onEnd() {
		triggerRef(images);
	},
});

/** 页脚只保留「取消 / 保存」：排序是即时可见的，不需要分步流程 */
props.dialog.setButtons([
	{ key: 'cancel', content: '取消', onClick: () => props.dialog.cancel() },
	{
		key: 'save',
		content: '保存',
		type: 'primary',
		onClick: () => void save(),
	},
]);

async function save() {
	if (status.saving) {
		return;
	}
	status.onSaving();
	// 请求期间禁止关闭：结果要写回这个视图，关掉就再也看不到失败提示了
	props.dialog.unclosable();
	try {
		const ordered = [...images.value];
		if (await props.commit(ordered)) {
			props.dialog.confirm(ordered);
		}
	} finally {
		status.offSaving();
		props.dialog.closable();
	}
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;

.hint {
	margin: 0 0 10px;
	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-7'));
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
	gap: 10px;
	padding: 2px;
}

.item {
	cursor: grab;
	position: relative;
	aspect-ratio: 3 / 4;
	overflow: hidden;
	border: 1px solid map.get(token.$theme, 'l-3');
	border-radius: 8px;
	background-color: map.get(token.$theme, 'd-5');
	&:active {
		cursor: grabbing;
	}
}

.thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
	// 原生图片拖拽会抢走 pointermove，拖拽全靠 SortableJS 自己处理
	-webkit-user-drag: none;
	user-select: none;
}

// 序号标在右下角：顺序是唯一语义，必须一眼可读，且不能挡住图片主体
.order {
	position: absolute;
	right: 6px;
	bottom: 6px;
	min-width: 18px;
	padding: 0 4px;
	border-radius: 9px;
	background-color: rgba(#000, 0.62);
	text-align: center;
	@include text.text(0.6875rem, 1.5, #fff);
}

.item-ghost {
	opacity: 0.5;
}
</style>
