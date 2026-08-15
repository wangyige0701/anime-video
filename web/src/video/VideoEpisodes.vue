<template>
	<div>
		<el-popover
			placement="top"
			effect="dark"
			:fallback-placements="['top']"
			:offset="25"
			:show-arrow="false"
			:show-after="300"
			:popper-options="popperOptions"
			:append-to="props.popoverContainer || 'body'"
			:width="250"
		>
			<template #reference>
				<span class="episodes-title">选集</span>
			</template>

			<div class="episodes-list">
				<el-collapse accordion v-model="activeSeason">
					<template v-for="season in unref(series).seasons" :key="season.id">
						<el-collapse-item :name="season.id" :title="season.title">
							<div class="episodes-container">
								<template v-for="episode in season.episodes" :key="episode.id">
									<span class="episode-item">
										<el-icon v-if="playerStore.episodeId === episode.id"></el-icon>
										<span class="episode-title">{{ episode.title }}</span>
									</span>
								</template>
							</div>
						</el-collapse-item>
					</template>
				</el-collapse>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { unref } from 'vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { usePlayerStore } from '@/stores/player';

const props = defineProps<{
	popoverContainer?: HTMLElement | null;
}>();

const popperOptions = { strategy: 'fixed' as const };
const playerStore = usePlayerStore();
const activeSeason = ref(playerStore.seasonId);
const series = inject<Ref<Series>>(DETAIL_SERIES_DATA)!;

watch(
	() => playerStore.seasonId,
	(seasonId) => {
		activeSeason.value = seasonId;
	},
	{ immediate: true, flush: 'sync' },
);
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

@mixin ellipsis {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.episodes-title {
	cursor: pointer;
	font-size: 0.875rem;
	padding: 5px 10px;
}

.episodes-list {
	.el-collapse {
		--el-collapse-border-color: transparent;
		--el-collapse-header-bg-color: transparent;
		--el-collapse-content-bg-color: transparent;
		--el-collapse-header-text-color: #{map.get(token.$theme, 'l-8')};
		--el-collapse-content-text-color: #{map.get(token.$theme, 'l-8')};
		--el-collapse-header-height: 2em;
		--el-collapse-header-font-size: 0.875rem;
		--el-collapse-content-font-size: 0.75rem;
		:deep(.el-icon) {
			font-size: inherit;
		}
		:deep(.el-collapse-item__content) {
			padding: 0;
			&:not(:last-child) {
				padding-bottom: 1em;
			}
		}
		:deep(.el-collapse-item__title) {
			@include ellipsis;
		}
	}
}

.episodes-container {
	display: flex;
	flex-direction: column;
	padding-left: 1em;
	.episode-item {
		height: 2em;
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 5px;
	}
	.episode-title {
		flex: 1;
		@include ellipsis;
	}
}
</style>
