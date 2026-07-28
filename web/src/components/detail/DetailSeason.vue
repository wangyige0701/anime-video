<template>
	<el-collapse-item :name="props.season.id" class="season">
		<template #title>
			<div class="season-title">
				<span class="title">{{ props.season.title }}</span>
				<span class="count">（共 {{ seasonCount }} 集）</span>
			</div>
		</template>
		<div class="episodes"></div>
	</el-collapse-item>
</template>

<script setup lang="ts">
import type { Season } from '@/data/season';

const props = defineProps<{
	season: Season;
}>();

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
	padding: 20px;
}
</style>
