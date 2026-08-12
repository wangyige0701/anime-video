<template>
	<div class="video-controller-container" @click.stop>
		<VideoTimeline />
		<el-space :size="20">
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="playerStore.togglePlay()">
				<PlayToggleIcon :play="!playerStore.isPlaying" />
			</el-icon>
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="prev">
				<PlayNextIcon ref="prevIcon" direction="prev" />
			</el-icon>
			<VideoTime />
			<el-icon class="icon" :size="ICON_SIZE" @click.stop="next">
				<PlayNextIcon ref="nextIcon" direction="next" />
			</el-icon>
		</el-space>
		<el-space></el-space>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import VideoTimeline from './VideoTimeline.vue';
import VideoTime from './VideoTime.vue';

const emit = defineEmits<{
	(e: 'prev'): void;
	(e: 'next'): void;
}>();

const ICON_SIZE = '1.5rem';
const playerStore = usePlayerStore();
const prevIcon = useTemplateRef('prevIcon');
const nextIcon = useTemplateRef('nextIcon');

function prev() {
	prevIcon.value?.trigger();
	emit('prev');
}

function next() {
	nextIcon.value?.trigger();
	emit('next');
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-controller-container {
	--progress-height: 4px;
	width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	background-color: map.get(token.$theme, 'video-controller-dark');
	padding: 1rem;
	padding-top: calc(1rem + var(--progress-height));
	color: map.get(token.$theme, 'l-9');
	.icon {
		cursor: pointer;
		transition: transform 0.3s ease;
		&:hover {
			transform: scale(1.1);
		}
	}
}
</style>
