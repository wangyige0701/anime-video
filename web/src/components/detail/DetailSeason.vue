<template>
	<el-collapse-item :name="props.season.id" class="season">
		<template #title>
			<div class="season-title">
				<!-- 拖拽季顺序的手柄，独立拦截点击避免触发折叠面板的展开/收起 -->
				<el-icon class="season-handle" :size="16" @click.stop><Rank /></el-icon>
				<span class="title">{{ props.season.title }}</span>
				<span class="count">（共 {{ seasonCount }} 集）</span>
			</div>
		</template>
		<div class="episode-panel" v-loading="status.sorting">
			<el-scrollbar :max-height="`calc(${maxEpisodeCount} * (0.875rem * 3) + (${maxEpisodeCount} - 1) * 10px)`">
				<div ref="episodesRef" class="episodes">
					<div
						v-for="(episode, index) in episodes"
						:key="episode.id"
						class="episode"
						:class="{ active: props.activeEpisodeId === episode.id }"
						@click.stop="$emit('play', episode)"
					>
						<span class="index">
							<!-- 手柄独立拦截点击，避免拖动结束时误触发播放 -->
							<el-icon class="drag-handle" :size="16" @click.stop><Rank /></el-icon>
							第 {{ index + 1 }} 集
						</span>
						<span class="title">{{ episode.title }}</span>
						<el-tooltip
							v-if="episode.id === props.lastEpisodeId"
							content="最后观看"
							placement="top"
							:show-after="300"
							:hide-after="0"
							:enterable="false"
						>
							<el-icon class="last-episode" size="2rem">
								<LastViewedIcon />
							</el-icon>
						</el-tooltip>
					</div>
				</div>
			</el-scrollbar>
		</div>
	</el-collapse-item>
</template>

<script setup lang="ts">
import type { Episode } from '@/data/episode';
import type { Season } from '@/data/season';
import { Rank } from '@element-plus/icons-vue';
import { shallowRef, triggerRef } from 'vue';
import { useDraggable } from 'vue-draggable-plus';

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

const status = useVueStatusRef('sorting');
const episodesRef = useTemplateRef('episodesRef');
/**
 * 拖拽操作的本地镜像：season.episodes 是 customRef，原地 splice 不会触发更新，
 * 因此排序必须在镜像数组上完成，成功后再通过 setEpisodes() 回写关系。
 *
 * 使用 shallowRef 而非 ref：ref 会把领域对象包成 Proxy 并丢失私有字段类型，
 * shallowRef 只跟踪数组引用，元素保持原始实例。
 */
const episodes = shallowRef<Episode[]>([]);
/** 拖拽前的顺序快照，仅在提交失败时用于恢复 */
let orderSnapshot: Episode[] = [];

watch(
	() => props.season.episodes,
	(list) => {
		// 原地替换保持数组引用不变，避免拖拽实例持有过期数组
		episodes.value.splice(0, episodes.value.length, ...list);
		triggerRef(episodes);
	},
	{ immediate: true },
);

useDraggable(episodesRef, episodes, {
	animation: 180,
	handle: '.drag-handle',
	ghostClass: 'episode-ghost',
	// 默认 clone 会 JSON 深拷贝被拖拽项，Episode 实例含 Ref 循环引用会抛错，拖拽只需要原对象
	clone: (episode) => episode,
	onStart() {
		orderSnapshot = [...episodes.value];
	},
	onEnd(event) {
		// 拖拽库可能原地 splice 数组，shallowRef 不会自动追踪，这里显式触发序号重算
		triggerRef(episodes);
		void commitSort(event.oldIndex, event.newIndex);
	},
});

/**
 * 提交拖拽结果。服务端会按“移动到第 N 位”把区间内其它集 ±1 平移，
 * 因此只提交被拖动的那一集，不能逐条提交。
 */
async function commitSort(oldIndex?: number, newIndex?: number) {
	if (status.sorting || oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
		return;
	}
	const moved = episodes.value[newIndex];
	if (!moved) {
		return;
	}
	const targetSort = newIndex + 1;
	status.onSorting();
	try {
		const success = await moved.updateSort(targetSort);
		if (!success) {
			// 请求失败时 updateSort 已回滚自身 sort，这里把本地顺序恢复成拖拽前的状态
			episodes.value.splice(0, episodes.value.length, ...orderSnapshot);
			triggerRef(episodes);
			return;
		}
		// 其余集的 sort 已被服务端平移，本地同步镜像避免字段与显示顺序长期不一致
		episodes.value.forEach((episode, index) => episode.syncSort(index + 1));
		props.season.setEpisodes([...episodes.value]);
	} finally {
		status.offSorting();
	}
}
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
	.index {
		display: inline-flex;
		align-items: center;
		gap: 5px;
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

// 季与集两级手柄共用同一套视觉：热区 24px、图标 16px，负外边距抵消留白不影响排版
.drag-handle,
.season-handle {
	cursor: grab;
	opacity: 0.5;
	width: 24px;
	height: 24px;
	margin: -4px;
	border-radius: 4px;
	user-select: none;
	&:hover {
		opacity: 1;
		color: token.$text-color-primary;
	}
	&:active {
		cursor: grabbing;
	}
}

// 拖动占位仅降低透明度，避免与卡片自身的 hover 效果叠加
.episode-ghost {
	opacity: 0.5;
}
</style>
