<template>
	<el-collapse-item :name="props.season.id" class="season">
		<template #title>
			<div class="season-title">
				<span class="title">{{ props.season.title }}</span>
				<span class="count">（共 {{ seasonCount }} 集）</span>
			</div>
		</template>
		<el-scrollbar :max-height="`calc(${maxEpisodeCount} * (0.875rem * 3) + (${maxEpisodeCount} - 1) * 10px)`">
			<div class="episodes">
				<template v-for="(episode, index) in props.season.episodes" :key="episode.id">
					<div
						class="episode"
						:class="{ active: props.activeEpisodeId === episode.id }"
						@click.stop="$emit('play', episode)"
					>
						<span class="index">第 {{ index + 1 }} 集</span>
						<span class="title">{{ episode.title }}</span>
						<el-icon v-if="episode.id === props.lastEpisodeId" class="last-episode" size="2rem">
							<LastViewedIcon />
						</el-icon>
					</div>
				</template>
			</div>
		</el-scrollbar>
	</el-collapse-item>
</template>

<script setup lang="ts">
import type { Episode } from '@/data/episode';
import type { Season } from '@/data/season';

const props = defineProps<{
	season: Season;
	activeEpisodeId?: string;
	lastEpisodeId?: string;
}>();
defineEmits<{
	(e: 'play', episode: Episode): void;
}>();

const maxEpisodeCount = 6;
const seasonCount = computed(() => props.season.episodes.length);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.season {
	--radius: 15px;
	--border: 1px solid map.get(token.$theme, 'l-4');
	--el-collapse-border-color: #{map.get(token.$theme, 'l-4')};
	--el-collapse-header-bg-color: #{map.get(token.$theme, 'season-bg')};
	--el-collapse-header-text-color: #{token.$text-color-primary};
	--el-collapse-header-font-size: 1rem;
	--el-collapse-content-bg-color: #{map.get(token.$theme, 'season-bg')};
	--el-collapse-content-font-size: 0.875rem;
	--el-collapse-content-text-color: #{token.$text-color-primary};
	border: 0;
	border-radius: var(--radius);
	overflow: hidden;
	:deep(.el-collapse-item__header) {
		height: auto;
		min-height: unset;
		padding: 20px;
		border: var(--border);
		border-bottom: 0;
	}
	:deep(.el-collapse-item__wrap) {
		border-bottom: 0;
	}
	:deep(.el-collapse-item__content) {
		padding: 0;
	}
	:deep(.el-scrollbar__wrap) {
		padding: 0;
		margin-bottom: 5px;
	}
}

.season-title {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 5px;
	line-height: 1;
	.title {
		color: token.$text-color-primary;
		font-size: 1rem;
	}
	.count {
		color: token.$text-color-secondary;
		font-size: 0.875rem;
	}
}

.episodes {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 10px;
	padding: 5px 20px;
	@media (max-width: 1500px) {
		grid-template-columns: repeat(3, 1fr);
	}
	@media (max-width: 1250px) {
		grid-template-columns: repeat(2, 1fr);
	}
	@media (max-width: 950px) {
		grid-template-columns: repeat(1, 1fr);
	}
}

.episode {
	cursor: pointer;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 1em;
	padding: calc(0.9em - 1px) 0.9em;
	font-size: 0.875rem;
	line-height: 1.2em;
	color: token.$text-color-primary;
	border-radius: 10px;
	border: 1px solid transparent;
	background-color: map.get(token.$theme, 'd-4');
	position: relative;
	transition:
		border-color 0.3s ease,
		box-shadow 0.3s ease,
		background-color 0.3s ease;
	&:hover,
	&.active {
		border-color: map.get(token.$theme, 'l-2');
		box-shadow:
			0 0 5px map.get(token.$theme, 'l-2') inset,
			0 0 3px map.get(token.$theme, 'd-3') inset;
		background-color: map.get(token.$theme, 'd-3');
	}
	&.active {
		background-color: map.get(token.$theme, 'd-2');
	}
	.title {
		flex: 1;
		word-break: break-all;
		color: token.$text-color-secondary;
	}
	.last-episode {
		position: absolute;
		top: 0.2rem;
		right: 0.2rem;
		color: map.get(token.$theme, 'l-9');
	}
}
</style>
