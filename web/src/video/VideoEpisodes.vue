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
		>
			<template #reference>
				<span class="episodes-title">选集</span>
			</template>

			<div class="episodes-list">
				<el-collapse v-model="activeSeason">
					<template v-for="season in unref(series).seasons" :key="season.id">
						<el-collapse-item :name="season.id" :title="season.title"></el-collapse-item>
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
</script>

<style scoped lang="scss">
.episodes-title {
	cursor: pointer;
	font-size: 0.875rem;
	padding: 5px 10px;
}
</style>
