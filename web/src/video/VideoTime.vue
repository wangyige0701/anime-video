<template>
	<div class="video-time">
		<el-space class="video-time__content" spacer="/" :size="5">
			<span class="time-text">{{ formatDuration(playStore.currentTime, playStore.duration) }}</span>
			<span class="time-text">{{ formatDuration(playStore.duration) }}</span>
		</el-space>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import { formatDuration } from '@/utils/duration';

const playStore = usePlayerStore();
</script>

<style scoped lang="scss">
.video-time {
	cursor: text;
	min-width: 90px;
	font-size: 0.875rem;
	text-align: center;
	.video-time__content {
		vertical-align: middle;
	}
	.time-text {
		font-variant-numeric: tabular-nums;
	}
}
</style>
