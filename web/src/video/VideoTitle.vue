<template>
	<div class="video-title-container">
		<span v-if="playerStore.seriesTitle" class="title">{{ playerStore.seriesTitle }}</span>
		<span>
			<span v-if="playerStore.seasonTitle" class="subtitle">{{ playerStore.seasonTitle }}</span>
			<span v-if="playerStore.seasonTitle && playerStore.episodeTitle" class="slash"> / </span>
			<span v-if="playerStore.episodeTitle" class="subtitle">
				{{ playerStore.episodeTitle }}
			</span>
		</span>
	</div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';

const playerStore = usePlayerStore();
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.video-title-container {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 5px;
	background: linear-gradient(map.get(token.$theme, 'video-controller-dark'), transparent);
	color: #fff;
	padding: 1rem;
	padding-bottom: 2rem;
	padding-right: 4rem;
	.title {
		font-size: 1rem;
	}
	.subtitle {
		font-size: 0.875rem;
	}
	.slash {
		vertical-align: middle;
	}
}
</style>
