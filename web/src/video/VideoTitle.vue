<template>
	<div class="video-title-container" :class="{ system: !!systemInfo }">
		<div class="system-info" v-if="systemInfo">
			<div class="info cpu">
				<span class="label">CPU</span>
				<span>{{ formatPercentage(systemInfo.cpu.usagePercentage) }}</span>
			</div>
			<div class="info memory">
				<span class="label">内存</span>
				<span>{{ formatPercentage(systemInfo.memory.usagePercentage) }}</span>
			</div>
		</div>
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
import { useSystemStore } from '@/stores/system';
import { formatPercentage } from '@/utils/format';

const playerStore = usePlayerStore();
const { systemInfo } = storeToRefs(useSystemStore());
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
	&.system {
		padding-top: 5px;
	}
	.title {
		font-size: 1rem;
	}
	.subtitle {
		font-size: 0.875rem;
	}
	.slash {
		vertical-align: middle;
	}
	.system-info {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-9');
		opacity: 0.8;
		line-height: 1;
		.info {
			display: flex;
			flex-direction: row;
			flex-wrap: nowrap;
			align-items: center;
			gap: 5px;
		}
		.label {
			line-height: 1;
			gap: 1rem;
		}
	}
}
</style>
