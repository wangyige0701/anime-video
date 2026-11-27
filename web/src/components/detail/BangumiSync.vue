<template>
	<div class="bangumi-sync">
		<el-tooltip content="从 Bangumi 同步季、集标题与排序" placement="bottom" :show-after="300">
			<el-button class="entry" :loading="status.matching" @click="open">
				<template #icon>
					<el-icon><Connection /></el-icon>
				</template>
				同步 Bangumi
			</el-button>
		</el-tooltip>

		<el-dialog
			v-model="visible"
			class="bangumi-dialog"
			width="860px"
			top="7vh"
			title="同步 Bangumi"
			append-to-body
			:close-on-click-modal="false"
			:close-on-press-escape="!busy"
			:show-close="!busy"
			:before-close="handleBeforeClose"
			@closed="reset"
		>
			<el-steps class="steps" :active="step" simple>
				<el-step title="匹配季与条目" />
				<el-step title="确认变更" />
			</el-steps>

			<div v-loading="status.previewing || status.applying" class="body">
				<el-scrollbar max-height="calc(80vh - 150px)">
					<section v-if="step === 0" class="match">
						<div v-for="(item, index) in seasons" :key="item.seasonId" class="season">
							<div class="season-head">
								<span class="path">{{ item.path }}</span>
								<span class="meta">{{ describeFiles(item) }}</span>
							</div>
							<div class="samples">{{ item.sampleFiles.join(' / ') }}</div>
							<el-select
								v-model="seasons[index].subjectIds"
								class="candidates"
								multiple
								filterable
								clearable
								popper-class="bangumi-popper"
								placeholder="选择 Bangumi 条目"
								:multiple-limit="MAX_SUBJECTS_PER_SEASON"
							>
								<el-option
									v-for="candidate in candidates"
									:key="candidate.id"
									:value="candidate.id"
									:label="candidateLabel(candidate)"
								>
									<span>{{ candidateLabel(candidate) }}</span>
									<span class="option-sub">{{ candidate.name }}</span>
								</el-option>
							</el-select>
						</div>
						<p v-if="!candidates.length && !status.matching" class="empty">
							没有搜索到候选条目，请手动在 Bangumi 确认条目 ID 后重试。
						</p>
						<ul v-if="matchNotes.length" class="notes">
							<li v-for="(note, index) in matchNotes" :key="index">{{ note }}</li>
						</ul>
					</section>

					<section v-else-if="previewData" class="preview">
						<div class="group">
							<div class="group-title">系列信息</div>
							<div
								v-for="field in seriesFields"
								:key="field.key"
								class="field"
								:class="{ same: field.same, long: field.key === 'description' }"
							>
								<div class="field-head">
									<el-checkbox v-model="selection.series[field.key]" :disabled="field.same" />
									<span class="label">{{ field.label }}</span>
									<!-- 内容一致时只显示一份值：并排两个相同文本没有信息量 -->
									<template v-if="field.same && field.key !== 'description'">
										<span class="to" :title="field.to">{{ field.to }}</span>
										<span class="same-tag">与当前一致</span>
									</template>
									<template v-else-if="field.key !== 'description'">
										<span class="from" :title="field.from">{{ field.from }}</span>
										<el-icon class="arrow"><Right /></el-icon>
										<span class="to" :title="field.to">{{ field.to }}</span>
									</template>
									<span v-else-if="field.same" class="same-tag">与当前一致</span>
								</div>
								<!-- 描述可能上百字，逐字比对才是用户真正要看的内容，不做任何截断 -->
								<div v-if="field.key === 'description'" class="field-long">
									<div v-if="!field.same" class="long-item">
										<span class="long-label">当前</span>
										<p class="long-text from-text">{{ field.from }}</p>
									</div>
									<div class="long-item">
										<span class="long-label">{{ field.same ? '当前' : 'Bangumi' }}</span>
										<p class="long-text to-text">{{ field.to }}</p>
									</div>
								</div>
							</div>
						</div>

						<div v-for="(season, index) in previewData.seasons" :key="season.seasonId" class="group">
							<div class="group-title">
								<el-checkbox
									v-model="selection.seasons[index].title"
									:disabled="isSameSeasonTitle(index)"
								/>
								<span class="from">{{ season.fromTitle }}</span>
								<el-icon class="arrow"><Right /></el-icon>
								<span class="to">{{ season.title }}</span>
								<span class="tag">{{ describeAlignment(season.alignment) }}</span>
								<span v-if="isSameSeasonTitle(index)" class="same-tag">与当前一致</span>
							</div>
							<div class="season-actions">
								<el-checkbox
									v-model="selection.seasons[index].order"
									:disabled="season.episodes.length < 2 || isSameSeasonOrder(index)"
								>
									按预览顺序重排 {{ season.episodes.length }} 集
								</el-checkbox>
								<span v-if="isSameSeasonOrder(index)" class="same-tag">顺序已一致</span>
								<span class="spacer"></span>
								<el-button text size="small" @click="setEpisodes(index, true)">全选</el-button>
								<el-button text size="small" @click="setEpisodes(index, false)">全不选</el-button>
							</div>
							<div class="episodes">
								<div
									v-for="episode in season.episodes"
									:key="episode.episodeId"
									class="episode"
									:class="{ same: isSameEpisode(index, episode.episodeId) }"
								>
									<el-checkbox
										v-model="selection.seasons[index].episodes[episode.episodeId]"
										:disabled="isSameEpisode(index, episode.episodeId)"
									/>
									<div class="ep-main">
										<div class="ep-line">
											<span class="index">{{ episode.position }}</span>
											<span class="title" :title="episode.title">{{ episode.title }}</span>
											<span v-if="episode.kind !== 'main'" class="kind">
												{{ episode.kind === 'special' ? '特别篇' : '未匹配' }}
											</span>
										</div>
										<div class="file" :title="episode.fileName">{{ episode.fileName }}</div>
									</div>
								</div>
							</div>
							<ul v-if="season.missing.length" class="notes">
								<li>
									官方剧集在本地未找到：{{
										season.missing.map((item) => `第 ${item.sort} 话 ${item.title}`).join('、')
									}}
								</li>
							</ul>
							<ul v-if="season.warnings.length" class="notes">
								<li v-for="(warning, index) in season.warnings" :key="index">{{ warning }}</li>
							</ul>
						</div>
					</section>
				</el-scrollbar>
			</div>

			<template #footer>
				<el-button :disabled="busy" @click="visible = false">取消</el-button>
				<template v-if="step === 0">
					<el-button :loading="status.matching" :disabled="status.previewing" @click="loadMatch"
						>重新匹配</el-button
					>
					<el-button
						type="primary"
						:loading="status.previewing"
						:disabled="!mappedCount"
						@click="loadPreview"
					>
						生成预览
					</el-button>
				</template>
				<template v-else>
					<el-button :disabled="busy" @click="step = 0">上一步</el-button>
					<el-button type="primary" :loading="status.applying" :disabled="!summary.total" @click="submit">
						应用 {{ summary.total }} 项
					</el-button>
				</template>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import type {
	BangumiCandidate,
	BangumiMatchResult,
	BangumiMatchSeason,
	BangumiPreviewResult,
} from '@/@types/bangumi-sync';
import type { Series } from '@/data/series';
import { Connection, Right } from '@element-plus/icons-vue';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { getSeriesStatusName } from '~shared/series-status';
import { getSeriesTypeName } from '~shared/series-types';
import { useVideoStore } from '@/stores/video';
import { applyBangumi, matchBangumi, previewBangumi } from '@/api/bangumi';
import {
	MAX_SUBJECTS_PER_SEASON,
	buildApplyInput,
	buildSeasonMapping,
	createSelection,
	diffPreview,
	describeAlignment,
	summarizeSelection,
} from '@/utils/bangumiSync';
import type {
	BangumiCurrentSnapshot,
	BangumiPreviewDiff,
	BangumiSeriesSelection,
	BangumiSelection,
} from '@/utils/bangumiSync';

const props = defineProps<{
	seriesId: string;
}>();
const emit = defineEmits<{
	(e: 'applied', series: Series): void;
}>();

/** 提示列表最多显示的条数，超出部分只提示数量，避免对话框被日志占满 */
const NOTE_LIMIT = 6;

const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const status = useVueStatusRef('matching', 'previewing', 'applying');
const visible = ref(false);
/** 0 = 匹配季与条目，1 = 确认变更 */
const step = ref(0);
const match = ref<BangumiMatchResult | null>(null);
const previewData = ref<BangumiPreviewResult | null>(null);
/** 预览与本地数据的逐项对比结果，用于把「无变化」的项排除在勾选之外 */
const diff = ref<BangumiPreviewDiff | null>(null);
/** 匹配结果的本地可编辑镜像，季与条目的对应关系由用户确认 */
const seasons = ref<BangumiMatchSeason[]>([]);
const selection = ref<BangumiSelection>({
	series: { title: false, description: false, date: false, status: false, types: false },
	seasons: [],
});

/** 任何一步请求进行中都算忙碌：此时关闭对话框会让请求结果无处落地 */
const busy = computed(() => status.matching || status.previewing || status.applying);
const candidates = computed(() => match.value?.candidates ?? []);
const mappedCount = computed(() => seasons.value.filter((season) => season.subjectIds.length).length);
const applyInput = computed(() => (previewData.value ? buildApplyInput(previewData.value, selection.value) : {}));
const summary = computed(() => summarizeSelection(applyInput.value));

const matchNotes = computed(() => {
	const result = match.value;
	if (!result) {
		return [];
	}
	const notes = [...result.warnings];
	if (result.notes) {
		notes.push(result.notes);
	}
	if (notes.length > NOTE_LIMIT) {
		return [...notes.slice(0, NOTE_LIMIT), `还有 ${notes.length - NOTE_LIMIT} 条提示`];
	}
	return notes;
});

/**
 * 系列字段的「修改前 → 修改后」。
 *
 * 修改前取当前领域对象，修改后取预览结果，两者并排展示，
 * 让用户能在勾选前确认覆盖内容（尤其是描述被清空的情况）。
 * `same` 为真表示两边内容完全一致，勾选框会禁用——提交同样的值只是白白多一次写请求。
 */
const seriesFields = computed(() => {
	const data = previewData.value;
	if (!data) {
		return [];
	}
	const current = series.value;
	const same = diff.value?.series;
	const fields: Array<{ key: keyof BangumiSeriesSelection; label: string; from: string; to: string; same: boolean }> =
		[
			{
				key: 'title',
				label: '标题',
				from: current.title || '空',
				to: data.series.title || '空',
				same: !!same?.title,
			},
			{
				key: 'description',
				label: '剧情简介',
				from: current.description || '空',
				to: data.series.description || '空',
				same: !!same?.description,
			},
			{
				key: 'date',
				label: '上线时间',
				from: formatDate(current.date),
				to: formatDate(data.series.date),
				same: !!same?.date,
			},
			{
				key: 'status',
				label: '状态',
				from: getSeriesStatusName(current.status) || '未设置',
				to: getSeriesStatusName(data.series.status) || '未设置',
				same: !!same?.status,
			},
			{
				key: 'types',
				label: '类型',
				from: formatTypes(current.types),
				to: formatTypes(data.series.types),
				same: !!same?.types,
			},
		];
	return fields;
});

/** 对比用的本地快照：只取会被覆盖的字段，季内顺序按当前展示顺序 */
const currentSnapshot = computed<BangumiCurrentSnapshot>(() => ({
	series: {
		title: series.value.title,
		description: series.value.description,
		date: series.value.date,
		status: series.value.status,
		types: series.value.types,
	},
	seasons: series.value.seasons.map((season) => ({
		seasonId: season.id,
		episodeIds: season.episodes.map((episode) => episode.id),
		episodeTitles: Object.fromEntries(season.episodes.map((episode) => [episode.id, episode.title])),
	})),
}));

function isSameSeasonTitle(index: number) {
	return !!diff.value?.seasons[index]?.title;
}

function isSameSeasonOrder(index: number) {
	return !!diff.value?.seasons[index]?.order;
}

function isSameEpisode(index: number, episodeId: string) {
	return !!diff.value?.seasons[index]?.episodes[episodeId];
}

function formatDate(value?: Array<number | undefined> | null) {
	const year = value?.[0];
	const month = value?.[1];
	if (year && month) {
		return `${year} 年 ${month} 月`;
	}
	return year ? `${year} 年` : '未设置';
}

function formatTypes(ids: number[]) {
	return (
		ids
			.map((id) => getSeriesTypeName(id))
			.filter(Boolean)
			.join(' / ') || '未设置'
	);
}

/** 一个季的文件概览：文件数与特别篇数都影响对齐结果，需要让用户看到 */
function describeFiles(season: BangumiMatchSeason) {
	return season.specialCount
		? `${season.fileCount} 个视频，${season.specialCount} 个特别篇`
		: `${season.fileCount} 个视频`;
}

function candidateLabel(candidate: BangumiCandidate) {
	const name = candidate.nameCn || candidate.name;
	return candidate.date ? `${name}（${candidate.date}）` : name;
}

async function open() {
	visible.value = true;
	step.value = 0;
	await loadMatch();
}

async function loadMatch() {
	status.onMatching();
	try {
		const result = await matchBangumi(props.seriesId);
		match.value = result;
		// 复制一份可编辑的镜像：候选条目要能被用户改写，不能直接改接口返回值
		seasons.value = result.seasons.map((season) => ({ ...season, subjectIds: [...season.subjectIds] }));
	} catch {
		// 请求失败的提示由 API 层统一给出；保留对话框，用户可以就地重试
		// 而不是每次都从入口按钮重新打开
	} finally {
		status.offMatching();
	}
}

async function loadPreview() {
	const mapping = buildSeasonMapping(seasons.value);
	if (!mapping.some((item) => item.subjectIds.length)) {
		return;
	}
	status.onPreviewing();
	try {
		const result = await previewBangumi(props.seriesId, mapping);
		diff.value = diffPreview(result, currentSnapshot.value);
		previewData.value = result;
		selection.value = createSelection(result, diff.value);
		step.value = 1;
	} catch {
		// 保持匹配步骤，用户调整条目后可以再次生成预览
	} finally {
		status.offPreviewing();
	}
}

async function submit() {
	const input = applyInput.value;
	if (!summarizeSelection(input).total) {
		return;
	}
	const total = summary.value.total;
	status.onApplying();
	try {
		await applyBangumi(props.seriesId, input);
		visible.value = false;
		ElMessage.success(`已写入 Bangumi 数据 ${total} 项`);
		// 写入成功后重新扫描并装配该系列，页面上的标题与顺序才会与实际数据一致
		emit('applied', await useVideoStore().refreshSeries(props.seriesId));
	} catch {
		// 失败保留对话框与勾选状态，便于用户调整后重试
	} finally {
		status.offApplying();
	}
}

/** 全选/全不选只作用于有变化的集，「与当前一致」的项始终不参与提交 */
function setEpisodes(index: number, checked: boolean) {
	const picked = selection.value.seasons[index];
	const season = previewData.value?.seasons[index];
	if (!picked || !season) {
		return;
	}
	for (const episode of season.episodes) {
		if (isSameEpisode(index, episode.episodeId)) {
			continue;
		}
		picked.episodes[episode.episodeId] = checked;
	}
}

/**
 * 请求进行中拦截所有关闭入口（右上角关闭、Esc）。
 *
 * 匹配与预览的响应要写回对话框状态，关闭后再返回会更新一个已卸载的视图：
 * 用户既看不到结果，也无法判断是否成功，只能重新打开再来一次。
 */
function handleBeforeClose(done: () => void) {
	if (busy.value) {
		return;
	}
	done();
}

function reset() {
	step.value = 0;
	match.value = null;
	previewData.value = null;
	diff.value = null;
	seasons.value = [];
	selection.value = {
		series: { title: false, description: false, date: false, status: false, types: false },
		seasons: [],
	};
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.entry {
	flex-shrink: 0;
	// 颜色全部来自全局按钮封装，这里只管与标题行的尺寸配合
	height: 32px;
	padding: 0 12px;
	font-size: 0.8125rem;
}
</style>

<style lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

// 对话框挂载在 body 上，业务布局样式不能写在 scoped 里；
// 主题变量（底色、文字、描边、填充）由 assets/elements/dialog.scss 统一提供，这里不再重复。
body .el-dialog.bangumi-dialog {
	.steps {
		margin-bottom: 15px;
	}
	.body {
		min-height: 120px;
	}
	.season {
		padding: 12px 15px;
		border-radius: 10px;
		background-color: map.get(token.$theme, 'd-4');
		&:not(:last-child) {
			margin-bottom: 10px;
		}
	}
	.season-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 0.875rem;
		.path {
			color: map.get(token.$theme, 'l-9');
		}
		.meta {
			color: map.get(token.$theme, 'l-6');
			font-size: 0.75rem;
		}
	}
	.samples {
		margin: 5px 0 10px;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
		word-break: break-all;
	}
	.candidates {
		width: 100%;
	}
	.empty {
		margin: 0;
		color: map.get(token.$theme, 'l-6');
		font-size: 0.875rem;
	}
	.notes {
		margin: 10px 0 0;
		padding-left: 18px;
		color: map.get(token.$theme, 'l-6');
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.group {
		padding: 12px 15px;
		border-radius: 10px;
		background-color: map.get(token.$theme, 'd-4');
		&:not(:last-child) {
			margin-bottom: 10px;
		}
	}
	.group-title,
	.field-head {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.875rem;
	}
	.group-title {
		color: map.get(token.$theme, 'l-9');
	}
	.field + .field {
		margin-top: 8px;
	}
	.field.same .label {
		color: map.get(token.$theme, 'l-6');
	}
	.label {
		width: 4em;
		flex-shrink: 0;
		color: map.get(token.$theme, 'l-7');
	}
	// 「无变化」标记：让用户知道勾选框为什么是灰的，而不是以为坏了
	.same-tag {
		flex-shrink: 0;
		padding: 0 6px;
		border-radius: 4px;
		background-color: map.get(token.$theme, 'd-2');
		color: map.get(token.$theme, 'l-6');
		font-size: 0.75rem;
		line-height: 1.6;
	}
	// 描述行没有单值占位，单独把标签推到右边缘，与其它字段对齐
	.field-head .same-tag {
		margin-left: auto;
	}
	.from,
	.to {
		// 两列等分剩余宽度，长文本各自省略；不这样写会把短的一侧压成只剩「…」
		flex: 1 1 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.from {
		color: map.get(token.$theme, 'l-6');
		text-decoration: line-through;
	}
	.to {
		color: map.get(token.$theme, 'l-9');
	}
	.arrow {
		flex-shrink: 0;
		color: map.get(token.$theme, 'l-5');
	}
	.tag {
		margin-left: auto;
		flex-shrink: 0;
		padding: 2px 8px;
		border-radius: 5px;
		border: 1px solid map.get(token.$theme, 'l-3');
		color: map.get(token.$theme, 'l-7');
		font-size: 0.75rem;
	}
	// 描述是长文本：不截断、按原文换行，长串也必须在容器内折行
	.field-long {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 6px 0 0 28px;
	}
	.long-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
	}
	.long-label {
		flex-shrink: 0;
		width: 4.5em;
		padding-top: 2px;
		color: map.get(token.$theme, 'l-6');
		font-size: 0.75rem;
		line-height: 1.7;
	}
	.long-text {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	// 多行文本不加删除线：整段划线会盖住字，靠「当前 / Bangumi」标签区分更清楚
	.from-text {
		color: map.get(token.$theme, 'l-6');
	}
	.to-text {
		color: map.get(token.$theme, 'l-8');
	}
	.season-actions {
		display: flex;
		align-items: center;
		margin-top: 10px;
		font-size: 0.75rem;
		.spacer {
			flex: 1;
		}
	}
	// 纵向单列：剧集标题与文件名都长，横向并排会把容器撑宽或互相挤到看不见
	.episodes {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
	}
	.episode {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
		padding: 3px 6px;
		border-radius: 6px;
		transition: background-color 0.15s ease;
		&:hover {
			background-color: map.get(token.$theme, 'd-3');
		}
		// 勾选框默认 32px 高，会把两行内容撑出大片空隙
		.el-checkbox {
			height: auto;
			margin-right: 0;
		}
		&.same .title {
			color: map.get(token.$theme, 'l-6');
		}
	}
	.ep-main {
		flex: 1;
		min-width: 0;
	}
	.ep-line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		font-size: 0.875rem;
		.index {
			flex-shrink: 0;
			width: 2em;
			color: map.get(token.$theme, 'l-6');
			font-size: 0.75rem;
		}
		.title {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: map.get(token.$theme, 'l-8');
		}
		.kind {
			flex-shrink: 0;
			color: map.get(token.$theme, 'l-6');
			font-size: 0.75rem;
		}
	}
	.ep-main .file {
		margin-top: 1px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: map.get(token.$theme, 'l-5');
		font-size: 0.75rem;
	}
}

// 下拉面板同样挂载在 body 上；主题由 assets/elements/select.scss 统一处理，
// 这里只保留候选条目的业务排版
body .el-popper.bangumi-popper {
	.option-sub {
		margin-left: 8px;
		color: map.get(token.$theme, 'l-5');
		font-size: 0.75rem;
	}
}
</style>
