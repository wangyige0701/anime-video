<template>
	<div class="video-time">
		<el-space class="video-time__content" spacer="/" :size="5">
			<span>{{ formatDuration(playStore.currentTime) }}</span>
			<span>{{ formatDuration(playStore.duration) }}</span>
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
	.video-time__content {
		vertical-align: middle;
	}
}
</style>
