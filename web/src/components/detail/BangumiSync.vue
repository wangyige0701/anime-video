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
			<div class="steps">
				<span class="step" :class="{ active: step === 0, done: step > 0 }">
					<span class="step-index">
						<el-icon v-if="step > 0"><Check /></el-icon>
						<template v-else>1</template>
					</span>
					匹配季与条目
				</span>
				<el-icon class="step-arrow"><Right /></el-icon>
				<span class="step" :class="{ active: step === 1 }">
					<span class="step-index">2</span>
					确认变更
				</span>
			</div>

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
							<header class="group-head">
								<span class="group-title">系列信息</span>
								<span v-if="seriesChangedCount" class="group-stat">
									将更新 {{ seriesChangedCount }} 项，其余保持当前值
								</span>
								<span v-else class="group-stat">全部与当前一致，无需更新</span>
							</header>

							<div
								v-for="field in seriesFields"
								:key="field.key"
								class="row"
								:class="{ changed: !field.same }"
							>
								<el-checkbox v-model="selection.series[field.key]" :disabled="field.same" />
								<span class="row-label">{{ field.label }}</span>

								<div class="row-body">
									<!-- 短字段：无变化只显示一份值，变化时「当前 → 改为」，两侧都带文字说明 -->
									<template v-if="field.key !== 'description'">
										<template v-if="field.same">
											<span class="value" :title="field.to">{{ field.to }}</span>
										</template>
										<template v-else>
											<span class="value old" :title="field.from">{{ field.from }}</span>
											<el-icon class="swap"><Right /></el-icon>
											<span class="value new" :title="field.to">{{ field.to }}</span>
										</template>
									</template>
								</div>

								<span class="state" :class="field.same ? 'state--same' : 'state--diff'">
									{{ field.same ? '保持当前值' : '将替换' }}
								</span>

								<!-- 描述可能上百字，逐字比对才是用户真正要看的内容，不做任何截断 -->
								<div v-if="field.key === 'description'" class="long">
									<div v-if="!field.same" class="long-item">
										<span class="long-label">当前</span>
										<p class="long-text old-text">{{ field.from }}</p>
									</div>
									<div class="long-item">
										<span class="long-label">{{ field.same ? '当前' : '改为' }}</span>
										<p class="long-text" :class="{ 'new-text': !field.same }">{{ field.to }}</p>
									</div>
								</div>
							</div>
						</div>

						<div v-for="(season, index) in previewData.seasons" :key="season.seasonId" class="group">
							<header class="group-head">
								<span class="group-title">{{ season.path || `第 ${index + 1} 季` }}</span>
								<span class="chip chip--muted">{{ describeAlignment(season.alignment) }}</span>
								<span class="group-stat">{{ seasonStatText(index) }}</span>
							</header>

							<div class="row" :class="{ changed: !isSameSeasonTitle(index) }">
								<el-checkbox
									v-model="selection.seasons[index].title"
									:disabled="isSameSeasonTitle(index)"
								/>
								<span class="row-label">季标题</span>
								<div class="row-body">
									<template v-if="isSameSeasonTitle(index)">
										<span class="value" :title="season.title">{{ season.title }}</span>
									</template>
									<template v-else>
										<span class="value old" :title="season.fromTitle">
											{{ season.fromTitle || '未命名' }}
										</span>
										<el-icon class="swap"><Right /></el-icon>
										<span class="value new" :title="season.title">{{ season.title }}</span>
									</template>
								</div>
								<span class="state" :class="isSameSeasonTitle(index) ? 'state--same' : 'state--diff'">
									{{ isSameSeasonTitle(index) ? '保持当前值' : '将替换' }}
								</span>
							</div>

							<div class="row row--order" :class="{ changed: !isSameSeasonOrder(index) }">
								<el-checkbox
									v-model="selection.seasons[index].order"
									:disabled="season.episodes.length < 2 || isSameSeasonOrder(index)"
								>
									按预览顺序重排 {{ season.episodes.length }} 集
								</el-checkbox>
								<span class="state" :class="isSameSeasonOrder(index) ? 'state--same' : 'state--diff'">
									{{ isSameSeasonOrder(index) ? '顺序不变' : '顺序将调整' }}
								</span>
								<span class="spacer"></span>
								<el-button text size="small" @click="setEpisodes(index, true)">全选</el-button>
								<el-button text size="small" @click="setEpisodes(index, false)">全不选</el-button>
							</div>

							<div class="episodes">
								<div
									v-for="episode in season.episodes"
									:key="episode.episodeId"
									class="episode"
									:class="{
										changed: !isSameEpisode(index, episode.episodeId),
										same: isSameEpisode(index, episode.episodeId),
									}"
								>
									<el-checkbox
										v-model="selection.seasons[index].episodes[episode.episodeId]"
										:disabled="isSameEpisode(index, episode.episodeId)"
									/>
									<span class="ep-index">{{ episode.position }}</span>
									<div class="ep-body">
										<div class="ep-line">
											<span class="ep-title" :title="episode.title">{{ episode.title }}</span>
											<span v-if="episode.kind !== 'main'" class="chip chip--muted">
												{{ episode.kind === 'special' ? '特别篇' : '未匹配' }}
											</span>
											<span class="spacer"></span>
										</div>
										<div class="ep-meta">
											<span class="meta-item" :title="episode.fileName">
												<span class="meta-label">文件</span>{{ episode.fileName }}
											</span>
											<span
												v-if="!isSameEpisode(index, episode.episodeId)"
												class="meta-item"
												:title="localEpisodeTitle(season.seasonId, episode.episodeId)"
											>
												<span class="meta-label">原集标题</span>
												{{ localEpisodeTitle(season.seasonId, episode.episodeId) || '空' }}
											</span>
										</div>
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
				<div class="dialog-footer">
					<span v-if="step === 1" class="apply-summary">{{ summaryText }}</span>
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
				</div>
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
import { Check, Connection, Right } from '@element-plus/icons-vue';
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

/** 系列字段里有几项会被覆盖：分组标题用它说明「其余保持当前值」 */
const seriesChangedCount = computed(() => seriesFields.value.filter((field) => !field.same).length);

/** 一集在本地的当前标题，用于「原集标题」提示 */
function localEpisodeTitle(seasonId: string, episodeId: string) {
	return currentSnapshot.value.seasons.find((item) => item.seasonId === seasonId)?.episodeTitles[episodeId] ?? '';
}

/** 一个季里有多少处会变化：集标题、季标题、重排分别计数 */
function countSeasonChanges(index: number) {
	const season = previewData.value?.seasons[index];
	if (!season) {
		return 0;
	}
	const episodes = season.episodes.filter((episode) => !isSameEpisode(index, episode.episodeId)).length;
	return episodes + (isSameSeasonTitle(index) ? 0 : 1) + (isSameSeasonOrder(index) ? 0 : 1);
}

function seasonStatText(index: number) {
	const count = countSeasonChanges(index);
	return count ? `将更新 ${count} 处` : '与当前一致';
}

/**
 * 页脚汇总。
 *
 * 「应用 14 项」只给出总数，用户没法确认勾中的是标题还是重排，这里拆成四类分别计数；
 * 一类都没勾时给出明确提示，避免按钮禁用却不知道为什么。
 */
const summaryText = computed(() => {
	const stats = summary.value;
	const seasonTitles = stats.titles - stats.series;
	const parts = [
		stats.series ? `系列字段 ${stats.series}` : '',
		seasonTitles ? `季标题 ${seasonTitles}` : '',
		stats.episodes ? `集标题 ${stats.episodes}` : '',
		stats.orders ? `重排 ${stats.orders} 季` : '',
	].filter(Boolean);
	return parts.length ? `将写入 ${stats.total} 项：${parts.join(' · ')}` : '未勾选任何变更';
});

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
	/**
	 * 步骤条自己拼，不用 el-steps 的 simple 模式：
	 * 它把箭头画成两根 1px 斜线（`::before`/`::after`），和图标体系不搭、缩放后还发毛。
	 * 这里改用 `ArrowRight` 图标，序号圈与状态色都取主题梯度。
	 */
	.steps {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
		padding: 10px 14px;
		border-radius: 10px;
		background-color: map.get(token.$theme, 'd-4');
	}

	.step {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.875rem;
		line-height: 1.5;
		color: map.get(token.$theme, 'l-6');
	}

	.step-index {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px map.get(token.$theme, 'l-4');
		font-size: 0.6875rem;
		line-height: 1;
	}

	.step.active {
		color: map.get(token.$theme, 'l-9');
		font-weight: 600;

		.step-index {
			box-shadow: inset 0 0 0 1.5px map.get(token.$theme, 'primary');
			color: map.get(token.$theme, 'primary');
		}
	}

	.step.done {
		color: map.get(token.$theme, 'l-7');

		.step-index {
			box-shadow: none;
			background-color: map.get(token.$theme, 'l-4');
			color: map.get(token.$theme, 'd-5');
		}
	}

	.step-arrow {
		flex-shrink: 0;
		font-size: 1rem;
		color: map.get(token.$theme, 'l-6');
	}

	.body {
		min-height: 120px;
	}

	/* ---------- 步骤一：匹配季与条目 ---------- */

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

	/* ---------- 步骤二：确认变更 ---------- */

	.group {
		padding: 14px 16px;
		border-radius: 10px;
		background-color: map.get(token.$theme, 'd-4');

		&:not(:last-child) {
			margin-bottom: 10px;
		}
	}

	.group-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}

	.group-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: map.get(token.$theme, 'l-9');
	}

	.group-stat {
		margin-left: auto;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
	}

	/**
	 * 状态胶囊。
	 *
	 * 一致 = 描边（弱），将更新 = 实心底 + 亮描边（强），一眼能分出「会不会被替换」。
	 * 颜色全取主题梯度，换主题时强弱关系不变，也不引入固定色。
	 */
	.chip {
		flex-shrink: 0;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 0.6875rem;
		line-height: 1.7;
		white-space: nowrap;
	}

	/**
	 * 行尾状态文字。
	 *
	 * 不用胶囊：一行一个色块的重复感很强，换成「圆点 + 文字」，
	 * 变化项提亮、无变化项压暗，靠明度区分而不靠底色。
	 */
	.state {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		line-height: 1.6;
		color: map.get(token.$theme, 'l-7');

		&::before {
			content: '';
			width: 5px;
			height: 5px;
			border-radius: 50%;
			background-color: currentColor;
			opacity: 0.6;
		}
	}

	/**
	 * 一致性用语义色而非主题色：绿=保持、红=替换，和 diff 的阅读习惯一致。
	 * 都取低饱和版本，深色面板上不刺眼；绿色与设置页的「已配置」同一色值。
	 */
	.state--same {
		color: #8fd67a;
	}

	.state--diff {
		color: #ff8f8f;

		&::before {
			opacity: 1;
		}
	}

	.chip--muted {
		color: map.get(token.$theme, 'l-6');
		background-color: map.get(token.$theme, 'd-3');
	}

	/**
	 * 一行变更：勾选框、字段名、当前值 → 新值、状态胶囊。
	 * 会覆盖当前值的行加左侧色条与浅底，扫一眼就能看出哪几行会被替换。
	 */
	.row {
		display: grid;
		grid-template-columns: auto 4.2em minmax(0, 1fr) auto;
		align-items: center;
		gap: 0 10px;
		padding: 7px 10px;
		border-radius: 8px;
		font-size: 0.8125rem;
		transition: background-color 0.15s ease;

		& + .row {
			margin-top: 2px;
		}

		&:hover {
			background-color: map.get(token.$theme, 'd-3');
		}

		/**
		 * 会覆盖当前值的行用浅底区分，不用左侧色条：
		 * 一屏里连排五六个竖线非常吵，靠底色 + 胶囊 + 旧值删除线已经能分清楚。
		 */
		&.changed {
			background-color: map.get(token.$theme, 'd-3');
		}

		// 勾选框默认 32px 高，会把整行撑出多余留白
		.el-checkbox {
			height: auto;
			margin-right: 0;
		}
	}

	.row-label {
		color: map.get(token.$theme, 'l-7');
		white-space: nowrap;
	}

	.row-body {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: map.get(token.$theme, 'l-8');
	}

	/**
	 * 旧值只压暗、不划删除线：整行文字被横线穿过很难读，
	 * 方向已经由「箭头 + 新值更亮」表达，这里只负责降一级视觉权重。
	 */
	.value.old {
		color: map.get(token.$theme, 'l-5');
	}

	.value.new {
		color: map.get(token.$theme, 'l-9');
		font-weight: 500;
	}

	.swap {
		flex-shrink: 0;
		color: map.get(token.$theme, 'l-5');
	}

	.long {
		grid-column: 2 / -1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
	}

	.long-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
	}

	.long-label {
		flex-shrink: 0;
		width: 3em;
		padding-top: 2px;
		font-size: 0.6875rem;
		line-height: 1.8;
		color: map.get(token.$theme, 'l-6');
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

	// 多行文本不加删除线：整段划线会盖住字，靠「当前 / 改为」标签区分更清楚
	.old-text {
		color: map.get(token.$theme, 'l-6');
	}

	.new-text {
		color: map.get(token.$theme, 'l-9');
	}

	.row--order {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.75rem;

		.spacer {
			flex: 1;
		}
	}

	.episodes {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
	}

	.episode {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 6px 10px;
		border-radius: 8px;
		transition: background-color 0.15s ease;

		&:hover {
			background-color: map.get(token.$theme, 'd-3');
		}

		// 剧集行不加左侧色条：整列重复的竖线很吵，改成「标题提亮 + 原集标题」表达变化
		.el-checkbox {
			height: auto;
			margin-right: 0;
		}
	}

	.ep-index {
		flex-shrink: 0;
		width: 1.8em;
		padding-top: 1px;
		text-align: right;
		font-size: 0.75rem;
		line-height: 1.6;
		color: map.get(token.$theme, 'l-6');
		font-variant-numeric: tabular-nums;
	}

	.ep-body {
		flex: 1;
		min-width: 0;
	}

	.ep-line {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;

		// 标题按内容宽度收缩，特别篇/一致胶囊才不会漂到行尾；剩余空间由 spacer 吃掉
		.spacer {
			flex: 1;
		}
	}

	.ep-title {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.875rem;
		color: map.get(token.$theme, 'l-8');
	}

	.episode.changed .ep-title {
		color: map.get(token.$theme, 'l-9');
	}

	// 无变化的集只压暗一行，不加标签，避免整列都是重复色块
	.episode.same {
		.ep-title {
			color: map.get(token.$theme, 'l-6');
		}

		.ep-index {
			color: map.get(token.$theme, 'l-4');
		}
	}

	// 「文件」「原集标题」两类附注并排，窄屏自动换行
	.ep-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 14px;
		margin-top: 2px;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
	}

	.meta-item {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta-label {
		margin-right: 5px;
		color: map.get(token.$theme, 'l-6');
	}

	.dialog-footer {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
	}

	.apply-summary {
		margin-right: auto;
		font-size: 0.75rem;
		color: map.get(token.$theme, 'l-6');
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
