<template>
	<div ref="cotnainer" class="video-progress_container">
		<div ref="line" class="video-progress_line">
			<div
				class="video-progress_current"
				:style="{ '--line-position': progress }"
			></div>
		</div>
		<div
			ref="bar"
			class="video-progress_bar"
			:style="{ '--bar-position': progress }"
			@mousedown="mousedoan"
			@click.stop=""
		></div>
	</div>
</template>

<script setup lang="ts">
import { useVideoStore } from '@/stores/video';
import {
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
	unref,
	useTemplateRef,
} from 'vue';

let isPress = false;
let oldValue = unref(useVideoStore().progress);
let startPressPosition = 0;
let startPressClientX = 0;

const cotnainer = useTemplateRef('cotnainer');
const bar = useTemplateRef('bar');
const line = useTemplateRef('line');
const lineLength = ref(0); // 滑块按压时进度条的长度
const afterMovePosition = ref(0);

const progress = computed(() => {
	const value = parseFloat(
		((unref(useVideoStore().progress) / 100) * lineLength.value).toFixed(2),
	);
	if (isPress) {
		return oldValue;
	}
	oldValue = value;
	return value;
});

function mousedoan(e: MouseEvent) {
	isPress = true;
	startPressClientX = e.clientX;
	if (bar.value) {
		const translateX = (
			getComputedStyle(bar.value).transform.match(
				/matrix\((.+)\)/,
			)?.[1] || ''
		)
			.trim()
			.split(',')[4];
		startPressPosition = parseFloat(translateX || '') || 0;
	}
}

function mouseup() {
	if (!isPress) {
		return;
	}
	isPress = false;
	useVideoStore().setProgress(
		(afterMovePosition.value / lineLength.value) * 100,
	);
}

function mousemove(e: MouseEvent) {
	if (!isPress) {
		return;
	}
	afterMovePosition.value =
		startPressPosition + (e.clientX - startPressClientX);
	if (afterMovePosition.value >= lineLength.value) {
		afterMovePosition.value = lineLength.value;
		return;
	}
	if (afterMovePosition.value <= 0) {
		afterMovePosition.value = 0;
		return;
	}
	if (cotnainer.value) {
		cotnainer.value.style.setProperty(
			'--move-position',
			String(afterMovePosition.value),
		);
	}
}

onMounted(() => {
	if (line.value) {
		lineLength.value = line.value.getBoundingClientRect().width;
		console.log(lineLength.value);
	}
	document.addEventListener('mouseup', mouseup);
	document.addEventListener('mousemove', mousemove);
});

onBeforeUnmount(() => {
	document.removeEventListener('mouseup', mouseup);
	document.removeEventListener('mousemove', mousemove);
});
</script>

<style scoped lang="scss">
.video-progress_container {
	width: 100%;
	height: 10px;
	position: relative;
}

.video-progress_line {
	cursor: pointer;
	width: 100%;
	height: 4px;
	position: absolute;
	top: 50%;
	left: 0;
	transform: translateY(-50%);
	background-color: #fff;
	border-radius: 2px;
}

.video-progress_current {
	width: calc(var(--move-position, var(--line-position)) * 1px);
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	background-color: #00f;
}

.video-progress_bar {
	cursor: pointer;
	width: 15px;
	height: 8px;
	background-color: #f00;
	border-radius: 2px;
	position: absolute;
	top: 50%;
	left: -7.5px;
	transform: translate(
		calc(var(--move-position, var(--bar-position)) * 1px),
		-50%
	);
}
</style>
