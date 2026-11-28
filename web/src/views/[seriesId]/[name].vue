<template>
	<div class="detail">
		<div class="top">
			<DetailImage :images="displayImages" @manage="openImageManage" />
			<div class="info">
				<div class="title-row">
					<TextEditor
						class="title"
						:value="series.value.title"
						:loading="series.value.titleRef"
						:disabled="status.waiting"
						show-edit-icon
						@blur="updateSeriesTitle"
					/>
					<!-- 未配置 AI 或 Bangumi 时不展示入口：点击后必然失败，不如引导去设置页 -->
					<BangumiSync v-if="settingsStore.syncAvailable" :series-id="seriesId" @applied="handleApplied" />
				</div>
				<DetailMetadata />
				<DetailDescription :series="series.value" :disabled="status.waiting" />
			</div>
		</div>

		<el-collapse ref="listRef" v-loading="status.sorting" accordion class="list" v-model="activeSeasonId">
			<template v-for="season in seasons" :key="season.id">
				<DetailSeason
					:season="season"
					:active-episode-id="activeEpisodeId"
					:last-episode-id="lastEpisodeId"
					:group-title="groupTitleOf.get(season.id) ?? ''"
					@play="play($event, season, series.value)"
				></DetailSeason>
			</template>
		</el-collapse>
	</div>

	<!-- 视频播放器 -->
	<VideoBox ref="videoBoxRef" @hide="activeEpisodeId = ''"></VideoBox>
</template>

<script setup lang="ts">
import { isUndefined } from '@wang-yige/utils';
import type { Episode } from '@/data/episode';
import type { Season } from '@/data/season';
import { Series } from '@/data/series';
import { useVideoStore } from '@/stores/video';
import { WebRoute } from '~shared/web-route-config';
import router from '@/router';
import VideoBox from '@/components/detail/VideoBox.vue';
import BangumiSync from '@/components/detail/BangumiSync.vue';
import DetailImageManage from '@/components/detail/DetailImageManage.vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { orderMergedImages, orderMergedSeasons } from '@/utils/seriesMerge';
import { openDialog } from '@/utils/dialog';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useDraggable } from 'vue-draggable-plus';

definePage({
	name: 'Detail',
});

const route = useRoute(WebRoute.DETAIL);
const name = route.params.name;
route.meta.setTitle!(name);

let isUnmounted = false;
const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const seriesId = useRoute(WebRoute.DETAIL).params.seriesId;
const status = useVueStatusRef('waiting', 'sorting').onWaiting();
const videoBoxRef = useTemplateRef('videoBoxRef');
const series = shallowReactive<{ value: Series }>({ value: {} as Series });
const activeSeasonId = ref<string>('');
const activeEpisodeId = ref<string>('');
const lastEpisodeId = ref<string>('');

const listRef = useTemplateRef('listRef');
/**
 * 季列表的本地镜像：series.value.seasons 是 customRef，原地调整不会触发更新，
 * 且关系数组不允许原地修改，因此拖拽在镜像上完成，成功后再通过 setSeasons() 回写。
 *
 * 使用 shallowRef 而非 ref：ref 会把领域对象包成 Proxy 并丢失私有字段类型。
 */
const seasons = shallowRef<Season[]>([]);
/** 拖拽前的顺序快照，仅在提交失败时用于恢复 */
let seasonSnapshot: Season[] = [];
/**
 * 被合并系列的分组，顺序与主系列记录的 `mergedIds` 一致。
 *
 * 合并只是展示层聚合：季仍然归属各自的系列，编辑标题、播放路径、集排序都按原系列走。
 */
const memberGroups = shallowRef<MemberGroup[]>([]);

/** 一个被合并系列在详情页上的可见内容 */
interface MemberGroup {
	id: string;
	title: string;
	seasons: Season[];
	/** 成员系列自己的图片，与主系列的一起展示；存的是绝对路径，可以直接拼接 */
	images: string[];
	/** 成员系列实例：排序成功后把子序写回它自己的季/图片数组，脱离后打开它的详情页也是新顺序 */
	instance: Series;
}

/**
 * 详情页展示的图片：默认主系列在前、被合并系列按合并顺序追加，
 * 再应用主系列记录的 `mergedImageOrder`（跨系列排序结果）。
 *
 * `images` 对外是绝对路径（服务端按各自系列目录拼好），跨系列拼接不需要换基准目录；
 * 路径本身就是唯一键，同一张图被两个目录收录时只保留第一次出现。
 * 这里不动数据，脱离合并后成员图片自然消失。
 */
const displayImages = computed(() =>
	orderMergedImages(
		[...(series.value.images ?? [])],
		memberGroups.value.flatMap((group) => group.images),
		series.value.mergedImageOrder ?? [],
	),
);

/** 成员季的来源系列标题；主系列自己的季不标注，避免每一项都顶一个多余的标签 */
const groupTitleOf = computed(() => {
	const map = new Map<string, string>();
	for (const group of memberGroups.value) {
		for (const season of group.seasons) {
			map.set(season.id, group.title);
		}
	}
	return map;
});

watch(
	() => series.value.seasons,
	() => rebuildSeasons(),
	{ immediate: true },
);

/** 主系列自己的季在前，成员系列按合并顺序依次追加，最后应用合并组的显式顺序 */
function rebuildSeasons() {
	const list = orderMergedSeasons(
		[...(series.value.seasons ?? [])],
		memberGroups.value.flatMap((group) => group.seasons),
		series.value.mergedSeasonOrder ?? [],
	);
	// 原地替换保持数组引用不变，避免拖拽实例持有过期数组
	seasons.value.splice(0, seasons.value.length, ...list);
	triggerRef(seasons);
}

/**
 * 拉取被合并系列的季与图片。
 *
 * 只对存在的成员生效：数据层的规范化会在下次扫描清理悬空 id，
 * 这里遇到请求失败就跳过，不让一条失效引用把整页拖垮。
 */
async function loadMembers(current: Series) {
	const ids = [...(current.mergedIds ?? [])];
	const groups = await Promise.all(
		ids.map(async (id) => {
			try {
				const member = await useVideoStore().getSeriesDetail(id);
				return {
					id,
					title: member.title,
					seasons: [...member.seasons],
					images: [...member.images],
					instance: member,
				};
			} catch (error) {
				console.warn('[merge] 成员季加载失败', id, error);
				return null;
			}
		}),
	);
	memberGroups.value = groups.filter((group): group is MemberGroup => !!group);
	rebuildSeasons();
}

// el-collapse 的模板 ref 是组件实例，拖拽需要挂到它的根元素上
useDraggable(
	computed(() => listRef.value?.$el as HTMLElement | undefined),
	seasons,
	{
		animation: 180,
		handle: '.season-handle',
		ghostClass: 'season-ghost',
		// 默认 clone 会 JSON 深拷贝被拖拽项，而 Season 实例含 Ref 等循环引用会直接抛错，
		// 拖拽只需要原对象引用，这里原样返回
		clone: (season) => season,
		onStart() {
			seasonSnapshot = [...seasons.value];
		},
		onEnd(event) {
			// 拖拽库原地调整数组，shallowRef 不会自动追踪，这里显式触发重渲染
			triggerRef(seasons);
			void commitSeasonSort(event.oldIndex, event.newIndex);
		},
	},
);

/**
 * 提交季排序。
 *
 * 两种语义按是否合并分流：
 * - 单系列：服务端按「移动到第 N 位」把区间内其它季 ±1 平移，因此只提交被拖动的那一季；
 * - 合并组：季跨多个系列，位置号无法表达跨系列落点，提交**完整顺序**，
 *   服务端把各系列自己的 `sort` 重编为该顺序中的子序，脱离后顺序与合并时一致。
 */
async function commitSeasonSort(oldIndex?: number, newIndex?: number) {
	if (status.sorting || isUndefined(oldIndex) || isUndefined(newIndex) || oldIndex === newIndex) {
		return;
	}
	const moved = seasons.value[newIndex];
	if (!moved) {
		return;
	}
	status.onSorting();
	try {
		if (memberGroups.value.length) {
			const success = await series.value.updateMergedSeasonOrder(seasons.value.map((season) => season.id));
			if (!success) {
				restoreSeasonSnapshot();
				return;
			}
			syncGroupSeasons();
			return;
		}
		const success = await moved.updateSort(newIndex + 1);
		if (!success) {
			// updateSort 已回滚自身 sort，这里把本地顺序恢复成拖拽前的状态
			restoreSeasonSnapshot();
			return;
		}
		// 其余季的 sort 已被服务端平移，本地同步镜像避免字段与显示顺序长期不一致
		seasons.value.forEach((season, index) => season.syncSort(index + 1));
		series.value.setSeasons([...seasons.value]);
	} finally {
		status.offSorting();
	}
}

function restoreSeasonSnapshot() {
	seasons.value.splice(0, seasons.value.length, ...seasonSnapshot);
	triggerRef(seasons);
}

/**
 * 把合并组的最终顺序拆回各系列。
 *
 * 服务端已按子序重写了每个系列的 `sort`，本地只做对齐：季按子序 `syncSort()` 并
 * 通过 `setSeasons()` 更新各自的季数组（脱离合并后打开成员的详情页也是新顺序），
 * 图片同理。不做这一步会出现「拖完顺序正确、刷新后成员仍按旧顺序」的不一致。
 */
function syncGroupSeasons() {
	const ownerOf = new Map<Season, MemberGroup>();
	for (const group of memberGroups.value) {
		for (const season of group.seasons) {
			ownerOf.set(season, group);
		}
	}
	const counters = new Map<MemberGroup, number>();
	const own: Season[] = [];
	for (const season of seasons.value) {
		const group = ownerOf.get(season);
		if (!group) {
			own.push(season);
			season.syncSort(own.length);
			continue;
		}
		const next = (counters.get(group) ?? 0) + 1;
		counters.set(group, next);
		season.syncSort(next);
	}
	for (const group of memberGroups.value) {
		const sub = seasons.value.filter((season) => ownerOf.get(season) === group);
		group.seasons = sub;
		group.instance.setSeasons(sub);
	}
	series.value.setSeasons(own);
}

/**
 * 打开图片排序面板。
 *
 * 面板只负责拖拽与“保存”，真正的写入通过 `commit` 回调走数据层，
 * 因此合并组与非合并组共用同一个面板，区别只在提交方法。
 */
async function openImageManage() {
	if (status.waiting || status.sorting) {
		return;
	}
	try {
		await openDialog<string[]>({
			component: DetailImageManage,
			title: '调整图片顺序',
			dialogProps: { width: '720px' },
			componentProps: {
				images: [...displayImages.value],
				merged: memberGroups.value.length > 0,
				commit: commitImageOrder,
			},
		});
	} catch {
		// 取消/关闭是正常路径，写入失败由 API 拦截器统一提示
	}
}

/**
 * 写入图片顺序：合并组记录跨系列顺序，单系列直接覆盖自己的图片顺序。
 *
 * @returns 请求是否成功；失败时数据层已回滚，面板会保留在打开状态
 */
async function commitImageOrder(images: string[]) {
	if (memberGroups.value.length) {
		const success = await series.value.updateMergedImageOrder(images);
		if (success) {
			syncGroupImages();
		}
		return success;
	}
	return await series.value.updateImages(images);
}

/** 把合并组的图片顺序拆回各系列，规则与 `syncGroupSeasons()` 一致 */
function syncGroupImages() {
	const ordered = series.value.mergedImageOrder;
	const ownPaths = new Set(series.value.images);
	series.value.syncImages(ordered.filter((image) => ownPaths.has(image)));
	for (const group of memberGroups.value) {
		const paths = new Set(group.images);
		const sub = ordered.filter((image) => paths.has(image));
		group.images = sub;
		group.instance.syncImages(sub);
	}
}

provide(
	DETAIL_SERIES_DATA,
	computed(() => series.value),
);

/**
 * 提交系列标题。
 *
 * 允许清空：服务端会还原为默认标题（系列目录名），数据层用返回值同步本地值，
 * 因此这里既不做非空校验，也不需要额外提示。
 */
async function updateSeriesTitle(value: string) {
	await series.value.updateTitle(value);
}

/**
 * Bangumi 同步写入后会重新扫描并装配整个系列。
 *
 * 这里整体替换详情数据而不是逐字段打补丁：标题、排序、季与集都可能变化，
 * 新实例已经带完整的关系树，直接替换最不容易和缓存中的旧对象混淆。
 */
function handleApplied(next: Series) {
	series.value = next;
	// 写入可能改变季结构，成员系列的季要重新拼进来
	void loadMembers(next);
}

function play(episode: Episode, season: Season, series: Series) {
	if (episode.id && videoBoxRef.value) {
		activeEpisodeId.value = episode.id;
		videoBoxRef.value.openAndPlay({
			seriesTitle: series.title || '',
			seriesId: series.id || '',
			seasonTitle: season.title || '',
			seasonId: season.id || '',
			episodeTitle: episode.title || '',
			episodeId: episode.id || '',
			videoPath: episode.path || '',
		});
	}
}

onMounted(async () => {
	// 与详情请求并行：同步入口只依赖设置状态，不必等它返回再加载页面
	void settingsStore.ensure();
	try {
		const info = await useVideoStore().getSeriesDetail(seriesId);
		series.value = info;
		await loadMembers(info);
		if (!isUnmounted) {
			playerStore.setSeriesId(series.value.id);
			const lastSeasonId = await playerStore.getLastSeasonId();
			if (lastSeasonId) {
				activeSeasonId.value = lastSeasonId;
			} else {
				// 主系列可能没有季（季都在被合并的系列里），默认展开取拼接后的第一个
				activeSeasonId.value = seasons.value[0]?.id || '';
			}
			const lastEpisodeIdValue = await playerStore.getLastEpisodeId();
			if (lastEpisodeIdValue) {
				lastEpisodeId.value = lastEpisodeIdValue;
			}
		}
		status.offWaiting();
	} catch (error) {
		router.replace({ name: WebRoute.INDEX, replace: true });
		playerStore.reset();
	}
});

onBeforeUnmount(() => {
	isUnmounted = true;
	playerStore.reset();
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.detail {
	--padding: 50px;
	width: 100%;
	padding-left: var(--padding);
	padding-right: calc(token.$menu-width + token.$main-padding + var(--padding));
}

.top {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: 20px;
	margin-bottom: 30px;
	.info {
		display: flex;
		flex-direction: column;
		gap: 15px;
		flex: 1;
		color: token.$text-color-secondary;
		font-size: 1rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.title {
		flex: 1;
		min-width: 0;
		color: token.$text-color-primary;
		font-size: 1.6rem;
		/* 标题字号较大，编辑图标跟随会过大，单独收敛到正文尺寸 */
		:deep(.edit) {
			font-size: 1rem;
		}
	}
}

.list {
	border: 0;
	// 用 gap 代替 :not(:last-child) 的 margin，拖拽重排时不会因末尾元素变化产生位移抖动
	display: flex;
	flex-direction: column;
	gap: 20px;
}

// 拖动占位仅降低透明度，避免与季面板自身的样式叠加
.season-ghost {
	opacity: 0.5;
}
</style>
