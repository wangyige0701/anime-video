<template>
	<div class="video-controller-container">
		<el-space>
			<el-icon :size="ICON_SIZE">
				<PlayToggleIcon :play="!playerStore.isPlaying" />
			</el-icon>
		</el-space>
		<el-space></el-space>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';

const playerStore = usePlayerStore();
const ICON_SIZE = '2rem';
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-controller-container {
	width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	background: linear-gradient(transparent, map.get(token.$theme, 'video-controller-dark'));
	padding: 1rem;
	padding-top: 2rem;
	color: map.get(token.$theme, 'l-9');
}
</style>
