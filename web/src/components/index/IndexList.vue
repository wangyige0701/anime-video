<template>
	<div class="index-list" @pointerdown="onPointerDown">
		<template v-for="segment in segments" :key="segment.key">
			<!-- 按上线时间排序时，每个月插入一条通栏分割线 -->
			<div v-if="segment.type === 'divider'" class="divider">
				<span class="label">{{ segment.label }}</span>
				<span class="line"></span>
				<span class="count">{{ segment.count }} 部</span>
			</div>
			<!-- 卡片抽成 SeriesCard，首页与搜索页共用同一套模板与样式 -->
			<SeriesCard
				v-else
				class="item"
				:series="segment.series"
				:replace="props.replace"
				:members="membersOf(segment.series)"
				:dragging="dragState.sourceId === segment.series.id"
				:drop-target="dragTargetId === segment.series.id"
				@detach="handleDetach(segment.series, $event)"
			/>
		</template>
	</div>

	<!-- 拖拽浮层：脱离列表的布局流，用 transform 跟随指针 -->
	<Teleport to="body">
		<div
			v-if="dragState.phase !== 'idle'"
			class="series-drag-layer"
			:class="`phase-${dragState.phase}`"
			:style="dragLayerStyle"
		>
			<div class="series-drag-card" :class="{ flipped: dragFlipped, 'has-cover': hasCover }">
				<div class="face front">
					<img v-if="hasCover" :src="dragState.imageUrl" alt="" draggable="false" />
					<span v-else>{{ dragState.title }}</span>
				</div>
				<!-- 背面沿用同一张海报：翻面是为了露出标题，不该把封面换成一张黑底卡片 -->
				<div class="face back" :style="dragCoverStyle">
					<span>{{ dragState.title }}</span>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { Series as SeriesModel } from '@/data/series';
import { endReachedEmitter } from '@/events/end-reached';
import { refreshEmitter } from '@/events/refresh';
import { useIndexFilterStore } from '@/stores/indexFilter';
import { useVideoStore } from '@/stores/video';
import { buildIndexPage, groupSeriesByMonth } from '@/utils/seriesQuery';
import { buildMergeOwnerIndex, getGroupMembers } from '@/utils/seriesMerge';
import { getSeriesCoverUrl } from '@/utils/series';
import { useSeriesDrag } from './useSeriesDrag';

/** 列表渲染片段：分割线或单个系列卡片 */
type ListSegment =
	| { type: 'item'; key: string; series: Series }
	| { type: 'divider'; key: string; label: string; count: number };

const props = withDefaults(
	defineProps<{
		pageSize?: number;
		/** 关键词，首页为空；搜索页由路由参数传入 */
		keyword?: string;
		/** 跳转详情时是否替换历史记录，搜索结果页需要开启 */
		replace?: boolean;
	}>(),
	{
		pageSize: 20,
		keyword: '',
		replace: false,
	},
);

const filter = useIndexFilterStore();
const status = useVueStatusRef('loading', 'over');
const datas = shallowReactive<Series[]>([]);
const page = ref(1);
/** 已生效的关键词，随 props 变化重新加载 */
const keyword = ref(props.keyword);
/** 请求版本号，用于丢弃过期响应（切换过滤条件或搜索词时可能并发） */
let requestVersion = 0;
/** 是否已经历过首次激活；keep-alive 下首次挂载也会触发 activated */
let activatedOnce = false;

/**
 * 渲染片段。
 *
 * 按上线时间排序时用分组结果展开成「分割线 + 该月卡片」，
 * 分组函数保证同月内部仍按名称升序，因此这里不需要再排序。
 */
const segments = computed<ListSegment[]>(() => {
	const list = [...datas];
	if (filter.sortMode !== 'date') {
		return list.map((series) => ({ type: 'item', key: series.id, series }));
	}
	return groupSeriesByMonth(list).flatMap((group) => {
		const divider: ListSegment = {
			type: 'divider',
			key: `divider-${group.key || 'empty'}`,
			label: group.label,
			count: group.items.length,
		};
		return [divider, ...group.items.map((series): ListSegment => ({ type: 'item', key: series.id, series }))];
	});
});

/**
 * 全量系列索引。
 *
 * 被合并的成员不会出现在 `datas` 里（列表查询已把它们过滤掉），
 * 但卡片背后的叠层和成员面板要能解析出它们的标题与首图，因此必须持有全量数据。
 */
const allSeries = shallowRef<SeriesModel[]>([]);
const seriesById = computed(() => new Map(allSeries.value.map((series) => [series.id, series])));
const owners = computed(() => buildMergeOwnerIndex(allSeries.value));

const {
	state: dragState,
	targetId: dragTargetId,
	begin: beginDrag,
} = useSeriesDrag({
	owners: () => owners.value,
	onMerge: handleMerge,
});

/** 拖拽浮层的几何与动效：位置用 transform，过渡交给阶段类名 */
const dragLayerStyle = computed(() => ({
	width: `${dragState.width}px`,
	height: `${dragState.height}px`,
	transform: `translate3d(${dragState.x}px, ${dragState.y}px, 0) scale(${dragState.scale})`,
	opacity: dragState.opacity,
}));

/** 源系列是否有封面；没有封面时翻面没有意义，两面都用标题占位 */
const hasCover = computed(() => !!dragState.imageUrl);

/**
 * 背面背景图。
 *
 * 翻转后看到的是背面，如果只给纯色就只剩一张黑卡片，认不出拖的是哪一部；
 * 沿用正面同一张海报、用遮罩压暗底部，标题和封面就都在。
 */
const dragCoverStyle = computed(() => (hasCover.value ? { backgroundImage: `url("${dragState.imageUrl}")` } : {}));

/**
 * 浮层是否已翻面。
 *
 * 挂载时如果直接是终态，浏览器没有起始值可插值，翻转动画不会执行；
 * 因此等浮层渲染完、下一帧再切换，才有「拿起时翻过来」的效果。
 */
const dragFlipped = ref(false);
watch(
	() => dragState.phase,
	async (phase) => {
		if (phase === 'idle') {
			dragFlipped.value = false;
			return;
		}
		if (phase !== 'drag') {
			return;
		}
		await nextTick();
		requestAnimationFrame(() => {
			dragFlipped.value = true;
		});
	},
);

/**
 * 解析某个系列的合并成员。
 *
 * 顺序取自主系列记录的 `mergedIds`，与服务端一致；悬空 id 会被跳过。
 */
function membersOf(series: Series) {
	return getGroupMembers(series, seriesById.value);
}

/**
 * 卡片上按下指针：只有落在卡片主体时才准备拖拽。
 *
 * 角标与成员面板标记了 `data-no-drag`，按下时直接放行，避免点「脱离」被当成拖拽起点。
 */
function onPointerDown(event: PointerEvent) {
	const target = event.target as HTMLElement | null;
	if (!target || target.closest('[data-no-drag]')) {
		return;
	}
	const card = target.closest<HTMLElement>('[data-series-id]');
	const id = card?.dataset.seriesId;
	if (!card || !id) {
		return;
	}
	const series = seriesById.value.get(id) ?? datas.find((item) => item.id === id);
	if (!series) {
		return;
	}
	beginDrag(event, card, { id, title: series.title, imageUrl: getSeriesCoverUrl(series) });
}

/**
 * 把 `sourceId` 并入 `targetId`。
 *
 * 成功后广播全量列表：成员从列表消失、主卡片长出叠层，两者的位置都会变，
 * 局部打补丁不如复用同一条刷新管线。
 *
 * 失败提示由 `api.ts` 拦截器统一给出（服务端 `ApiError` 的原因在纯文本响应体里），
 * 这里不重复弹 `ElMessage`，只把失败结果交给拖拽层决定浮层收尾。
 */
async function handleMerge(sourceId: string, targetId: string) {
	const main = seriesById.value.get(targetId);
	if (!main) {
		return false;
	}
	try {
		await main.mergeMember(sourceId);
		refreshEmitter.emit('series', await SeriesModel.getAllSeries());
		ElMessage.success(`已合并到「${main.title}」`);
		return true;
	} catch {
		return false;
	}
}

/** 让成员脱离当前系列的合并组；成员卡片会重新出现在列表里 */
async function handleDetach(series: Series, memberId: string) {
	try {
		await series.detachMember(memberId);
		refreshEmitter.emit('series', await SeriesModel.getAllSeries());
		ElMessage.success('已脱离合并');
	} catch {
		// 失败提示同 handleMerge，由拦截器统一给出
	}
}

// 搜索页的关键词来自路由参数，变化后从第一页重新加载
watch(
	() => props.keyword,
	(value) => {
		keyword.value = value;
		void reload();
	},
	{ flush: 'post' },
);

// 过滤或排序条件变化后从第一页重新加载
watch(
	() => filter.signature,
	() => {
		void reload();
	},
);

endReachedEmitter.on('endReached', (event) => {
	if (status.over || status.loading) {
		return;
	}
	if (event.direction !== 'bottom') {
		return;
	}
	page.value++;
	void load(false);
});

/**
 * 全量刷新后重新计算已加载页数内的数据。
 *
 * 刷新事件给出的是完整未过滤列表，必须按当前条件重新过滤排序后再截取，
 * 否则会把不符合过滤条件的系列塞回列表。
 */
refreshEmitter.on('series', (series) => {
	// 全量数据是叠层与成员面板的唯一来源，先更新它再重算列表
	allSeries.value = series;
	// 被合并的系列在这里同样要剔除，否则刚合并完的成员会立即被刷新事件重新塞回列表。
	const { items, total } = buildIndexPage(series, keyword.value, filter.query, page.value, props.pageSize);
	datas.splice(0, datas.length, ...items);
	// 刷新后可能出现新的可加载数据，解除「已加载完」标记
	if (items.length < total) {
		status.offOver();
	}
});

/**
 * 重新激活（含浏览器历史返回）时用缓存重算列表。
 *
 * 详情页改的上线时间、类型、状态都写在同一个缓存的 `Series` 实例上，但列表的顺序、
 * 过滤结果与分页是加载时算一次的结果；首页被 keep-alive 缓存，重新激活不会重跑
 * `onMounted`，于是卡片分组与时间轴停在改动前的状态。
 *
 * 这里借用刷新管线而不是就地改本地状态：时间轴刻度也订阅同一个事件，
 * 一份快照同时喂给列表与轴，两者不会出现「列表变了、轴还是旧的」。
 */
onActivated(() => {
	// keep-alive 首次挂载也会触发 activated，那次由 load() 负责，不要重复请求
	if (!activatedOnce) {
		activatedOnce = true;
		return;
	}
	void syncFromCache();
});

/** 从数据层缓存取快照并广播；不发网络请求 */
async function syncFromCache() {
	refreshEmitter.emit('series', await SeriesModel.getAllSeries());
}

/** 重置页码并从第一页重新加载 */
async function reload() {
	page.value = 1;
	await load(true);
}

/**
 * 加载指定页。
 *
 * @param reset 是否清空已加载数据（过滤条件变化时使用）
 */
async function load(reset: boolean) {
	const version = ++requestVersion;
	status.onLoading();
	try {
		await filter.initialize();
		const data = await useVideoStore().pagination(page.value, props.pageSize, keyword.value, filter.query);
		if (version !== requestVersion) {
			return;
		}
		if (reset) {
			datas.length = 0;
		}
		if (!data.length) {
			status.onOver();
		} else {
			datas.push(...data);
		}
		// 列表只含当前页，合并成员的标题与首图要从全量缓存里取
		allSeries.value = await SeriesModel.getAllSeries();
	} catch (error) {}
	if (version === requestVersion) {
		status.offLoading();
	}
}

onBeforeMount(() => {
	void load(true);
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.index-list {
	--count: 8;
	display: grid;
	grid-template-columns: repeat(var(--count), 1fr);
	column-gap: token.$main-padding;
	row-gap: calc(#{token.$main-padding} - 1rem);
	@media (min-width: 1921px) {
		--count: 10;
	}
	@media (max-width: 1720px) {
		--count: 7;
	}
	@media (max-width: 1520px) {
		--count: 6;
	}
	@media (max-width: 1320px) {
		--count: 5;
	}
	@media (max-width: 1120px) {
		--count: 4;
	}
	@media (max-width: 920px) {
		--count: 3;
	}
	@media (max-width: 768px) {
		--count: 2;
	}
}

// 时间分割线占满整行，不参与栅格分栏
.divider {
	grid-column: 1 / -1;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 12px;
	padding: 4px 2px;
	.label {
		font-size: 0.8125rem;
		line-height: 1;
		// 分割线是分组提示，但要保证在深色背景上能直接读到，取主色偏亮的中间梯度
		color: map.get(token.$theme, 'l-6');
	}
	.line {
		flex: 1;
		height: 1px;
		// 之前用 d-3 比背景更暗，几乎融进背景；改用亮于背景的主题梯度，细线也能看清
		background-color: map.get(token.$theme, 'l-5');
	}
	.count {
		font-size: 0.6875rem;
		line-height: 1;
		color: map.get(token.$theme, 'l-5');
	}
}

// 拖拽浮层：固定在视口上，用 transform 跟随指针，因此不会参与列表布局
.series-drag-layer {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 2600;
	pointer-events: none;
	perspective: 900px;
	will-change: transform, opacity;

	// 拖拽阶段逐帧写入位置，不能有过渡；飞入/飞回才需要缓动
	&.phase-drop,
	&.phase-return {
		transition:
			transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 0.26s ease;
	}
}

.series-drag-card {
	position: relative;
	width: 100%;
	height: 100%;
	transform-style: preserve-3d;
	// 拿起时翻面：正面是海报，背面是标题，翻过去更容易辨认正在拖哪一部
	transition: transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
	&.flipped {
		transform: rotateY(180deg);
	}
}

.face {
	position: absolute;
	inset: 0;
	overflow: hidden;
	border-radius: 10px;
	backface-visibility: hidden;
	box-shadow: 0 18px 40px rgb(0 0 0 / 55%);
	// 没有封面时两面都要有底色，否则浮层会变成一块透明玻璃
	background: linear-gradient(135deg, map.get(token.$theme, 'd-8'), map.get(token.$theme, 'd-9'));
}

// 无封面时的标题占位：居中显示，与背面底部的标题区分开
.front {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 12px;
	text-align: center;
	word-break: break-all;
	color: token.$text-color-primary;
	font-size: 0.875rem;
	line-height: 1.4;
}

.front img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.back {
	transform: rotateY(180deg);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 12px;
	text-align: center;
	word-break: break-all;
	background-size: cover;
	background-position: center;
	border: 1px solid map.get(token.$theme, 'd-6');
	color: token.$text-color-primary;
	font-size: 0.875rem;
	line-height: 1.4;

	// 有封面时压暗下半部分，底部标题压在亮色海报上也读得清
	.has-cover &::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgb(0 0 0 / 78%), rgb(0 0 0 / 28%) 40%, rgb(0 0 0 / 6%));
	}

	span {
		position: relative;
		z-index: 1;
	}
}
</style>
