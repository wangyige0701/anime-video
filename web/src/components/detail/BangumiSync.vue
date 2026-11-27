<template>
	<div class="bangumi-sync">
		<el-tooltip content="从 Bangumi 同步季、集标题与排序" placement="bottom" :show-after="300">
			<el-button class="entry" text :loading="status.matching" @click="open">
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
			:close-on-press-escape="!status.applying"
			:show-close="!status.applying"
			@closed="reset"
		>
			<el-steps class="steps" :active="step" simple>
				<el-step title="匹配季与条目" />
				<el-step title="确认变更" />
			</el-steps>

			<div v-loading="status.previewing || status.applying" class="body">
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
						<div v-for="field in seriesFields" :key="field.key" class="field">
							<el-checkbox v-model="selection.series[field.key]" />
							<span class="label">{{ field.label }}</span>
							<span class="from" :title="field.from">{{ field.from }}</span>
							<el-icon class="arrow"><Right /></el-icon>
							<span class="to" :title="field.to">{{ field.to }}</span>
						</div>
					</div>

					<div v-for="(season, index) in previewData.seasons" :key="season.seasonId" class="group">
						<div class="group-title">
							<el-checkbox v-model="selection.seasons[index].title" />
							<span class="from">{{ season.fromTitle }}</span>
							<el-icon class="arrow"><Right /></el-icon>
							<span class="to">{{ season.title }}</span>
							<span class="tag">{{ describeAlignment(season.alignment) }}</span>
						</div>
						<div class="season-actions">
							<el-checkbox
								v-model="selection.seasons[index].order"
								:disabled="season.episodes.length < 2"
							>
								按预览顺序重排 {{ season.episodes.length }} 集
							</el-checkbox>
							<span class="spacer"></span>
							<el-button text size="small" @click="setEpisodes(index, true)">全选</el-button>
							<el-button text size="small" @click="setEpisodes(index, false)">全不选</el-button>
						</div>
						<div class="episodes">
							<div v-for="episode in season.episodes" :key="episode.episodeId" class="episode">
								<el-checkbox v-model="selection.seasons[index].episodes[episode.episodeId]" />
								<span class="index">{{ episode.position }}</span>
								<span class="title">{{ episode.title }}</span>
								<span class="file">{{ episode.fileName }}</span>
								<span v-if="episode.kind !== 'main'" class="kind">
									{{ episode.kind === 'special' ? '特别篇' : '未匹配' }}
								</span>
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
			</div>

			<template #footer>
				<el-button :disabled="status.applying" @click="visible = false">取消</el-button>
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
					<el-button :disabled="status.applying" @click="step = 0">上一步</el-button>
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
	describeAlignment,
	summarizeSelection,
} from '@/utils/bangumiSync';
import type { BangumiSeriesSelection, BangumiSelection } from '@/utils/bangumiSync';

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
/** 匹配结果的本地可编辑镜像，季与条目的对应关系由用户确认 */
const seasons = ref<BangumiMatchSeason[]>([]);
const selection = ref<BangumiSelection>({
	series: { title: false, description: false, date: false, status: false, types: false },
	seasons: [],
});

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
 */
const seriesFields = computed(() => {
	const data = previewData.value;
	if (!data) {
		return [];
	}
	const current = series.value;
	const fields: Array<{ key: keyof BangumiSeriesSelection; label: string; from: string; to: string }> = [
		{ key: 'title', label: '标题', from: current.title, to: data.series.title },
		{
			key: 'description',
			label: '剧情简介',
			from: shorten(current.description) || '空',
			to: shorten(data.series.description) || '空',
		},
		{ key: 'date', label: '上线时间', from: formatDate(current.date), to: formatDate(data.series.date) },
		{
			key: 'status',
			label: '状态',
			from: getSeriesStatusName(current.status) || '未设置',
			to: getSeriesStatusName(data.series.status) || '未设置',
		},
		{ key: 'types', label: '类型', from: formatTypes(current.types), to: formatTypes(data.series.types) },
	];
	return fields;
});

function shorten(text: string, max = 60) {
	const value = text.replace(/\s+/g, ' ').trim();
	return value.length > max ? `${value.slice(0, max)}…` : value;
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
		// 请求失败的提示由 API 层统一给出，这里只需要收起空对话框
		visible.value = false;
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
		previewData.value = result;
		selection.value = createSelection(result);
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

function setEpisodes(index: number, checked: boolean) {
	const picked = selection.value.seasons[index];
	const season = previewData.value?.seasons[index];
	if (!picked || !season) {
		return;
	}
	for (const episode of season.episodes) {
		picked.episodes[episode.episodeId] = checked;
	}
}

function reset() {
	step.value = 0;
	match.value = null;
	previewData.value = null;
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
	--el-button-text-color: #{map.get(token.$theme, 'l-7')};
	--el-button-hover-text-color: #{map.get(token.$theme, 'l-9')};
	--el-button-hover-bg-color: #{map.get(token.$theme, 'l-2')};
	--el-button-hover-border-color: transparent;
	flex-shrink: 0;
}
</style>

<style lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

// 对话框挂载在 body 上，样式不能写在 scoped 里
body .el-dialog.bangumi-dialog {
	--el-dialog-bg-color: #{map.get(token.$theme, 'd-5')};
	--el-dialog-padding-primary: 20px;
	--el-text-color-primary: #{map.get(token.$theme, 'l-9')};
	--el-text-color-regular: #{map.get(token.$theme, 'l-8')};
	--el-text-color-secondary: #{map.get(token.$theme, 'l-6')};
	--el-text-color-placeholder: #{map.get(token.$theme, 'l-5')};
	--el-border-color: #{map.get(token.$theme, 'l-3')};
	--el-border-color-light: #{map.get(token.$theme, 'l-2')};
	--el-fill-color-blank: #{map.get(token.$theme, 'd-4')};
	--el-fill-color-light: #{map.get(token.$theme, 'd-3')};
	--el-checkbox-text-color: #{map.get(token.$theme, 'l-8')};
	--el-checkbox-checked-text-color: #{map.get(token.$theme, 'l-9')};
	--el-checkbox-input-border-color-hover: #{map.get(token.$theme, 'l-6')};
	border: 1px solid map.get(token.$theme, 'l-3');
	border-radius: 12px;
	.el-dialog__title {
		font-size: 1rem;
		color: map.get(token.$theme, 'l-9');
	}
	.el-dialog__header {
		padding-bottom: 10px;
	}
	.el-dialog__body {
		// 内容按需滚动，季多时不至于把对话框撑出视口
		max-height: calc(80vh - 150px);
		overflow: auto;
		scrollbar-width: thin;
	}
	.steps {
		margin-bottom: 15px;
		--el-text-color-placeholder: #{map.get(token.$theme, 'l-6')};
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
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.875rem;
	}
	.group-title {
		color: map.get(token.$theme, 'l-9');
	}
	.field:not(:first-child) {
		margin-top: 8px;
	}
	.label {
		width: 4em;
		flex-shrink: 0;
		color: map.get(token.$theme, 'l-7');
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
	.season-actions {
		display: flex;
		align-items: center;
		margin-top: 10px;
		font-size: 0.75rem;
		.spacer {
			flex: 1;
		}
	}
	.episodes {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 4px 15px;
		margin-top: 5px;
	}
	.episode {
		display: flex;
		align-items: center;
		gap: 8px;
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
		.file {
			max-width: 40%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: map.get(token.$theme, 'l-5');
			font-size: 0.75rem;
		}
		.kind {
			flex-shrink: 0;
			color: map.get(token.$theme, 'l-6');
			font-size: 0.75rem;
		}
	}
}

// 下拉面板同样挂载在 body 上，需要单独对齐深色主题
body .el-popper.bangumi-popper {
	--el-bg-color-overlay: #{map.get(token.$theme, 'd-5')};
	--el-text-color-regular: #{map.get(token.$theme, 'l-8')};
	--el-border-color-light: #{map.get(token.$theme, 'l-2')};
	--el-fill-color-light: #{map.get(token.$theme, 'd-3')};
	border-color: map.get(token.$theme, 'l-3');
	.el-select-dropdown__item.is-selected {
		color: map.get(token.$theme, 'l-9');
	}
	.option-sub {
		margin-left: 8px;
		color: map.get(token.$theme, 'l-5');
		font-size: 0.75rem;
	}
}
</style>
