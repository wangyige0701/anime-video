<template>
	<section class="preview">
		<p class="summary">{{ props.summaryText }}</p>

		<div class="group">
			<header class="group-head">
				<span class="group-title">系列信息</span>
				<span v-if="seriesChanged" class="group-stat">将更新 {{ seriesChanged }} 项，其余保持当前值</span>
				<span v-else class="group-stat">全部与当前一致，无需更新</span>
			</header>

			<div v-for="field in props.fields" :key="field.key" class="row" :class="{ changed: !field.same }">
				<el-checkbox
					:model-value="props.selection.series[field.key]"
					:disabled="field.same"
					@update:model-value="onSeriesChange(field.key, $event)"
				/>
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

		<div v-for="(season, index) in props.preview.seasons" :key="season.seasonId" class="group">
			<header class="group-head">
				<span class="group-title">{{ season.path || `第 ${index + 1} 季` }}</span>
				<span class="chip chip--muted">{{ describeAlignment(season.alignment) }}</span>
				<span class="group-stat">{{ seasonStatText(index) }}</span>
			</header>

			<div class="row" :class="{ changed: !sameSeasonTitle(index) }">
				<el-checkbox
					:model-value="props.selection.seasons[index]?.title"
					:disabled="sameSeasonTitle(index)"
					@update:model-value="onSeasonTitleChange(index, $event)"
				/>
				<span class="row-label">季标题</span>
				<div class="row-body">
					<template v-if="sameSeasonTitle(index)">
						<span class="value" :title="season.title">{{ season.title }}</span>
					</template>
					<template v-else>
						<span class="value old" :title="season.fromTitle">{{ season.fromTitle || '未命名' }}</span>
						<el-icon class="swap"><Right /></el-icon>
						<span class="value new" :title="season.title">{{ season.title }}</span>
					</template>
				</div>
				<span class="state" :class="sameSeasonTitle(index) ? 'state--same' : 'state--diff'">
					{{ sameSeasonTitle(index) ? '保持当前值' : '将替换' }}
				</span>
			</div>

			<div class="row row--order" :class="{ changed: !sameSeasonOrder(index) }">
				<el-checkbox
					:model-value="props.selection.seasons[index]?.order"
					:disabled="season.episodes.length < 2 || sameSeasonOrder(index)"
					@update:model-value="onSeasonOrderChange(index, $event)"
				>
					按预览顺序重排 {{ season.episodes.length }} 集
				</el-checkbox>
				<span class="state" :class="sameSeasonOrder(index) ? 'state--same' : 'state--diff'">
					{{ sameSeasonOrder(index) ? '顺序不变' : '顺序将调整' }}
				</span>
				<span class="spacer"></span>
				<el-button text size="small" @click="emit('select-all', index, true)">全选</el-button>
				<el-button text size="small" @click="emit('select-all', index, false)">全不选</el-button>
			</div>

			<div class="episodes">
				<div
					v-for="episode in season.episodes"
					:key="episode.episodeId"
					class="episode"
					:class="{
						changed: !sameEpisode(index, episode.episodeId),
						same: sameEpisode(index, episode.episodeId),
					}"
				>
					<el-checkbox
						:model-value="props.selection.seasons[index]?.episodes[episode.episodeId]"
						:disabled="sameEpisode(index, episode.episodeId)"
						@update:model-value="onEpisodeChange(index, episode.episodeId, $event)"
					/>
					<span class="ep-index">{{ episode.position }}</span>
					<div class="ep-body">
						<div class="ep-line">
							<span class="ep-title" :title="episode.title">{{ episode.title }}</span>
							<span
								v-if="episode.coveredCount > 1"
								class="chip chip--merge"
								:title="episode.coveredTitles.join('\n')"
							>
								合并 {{ episode.coveredCount }} 集
							</span>
							<span
								v-if="kindLabel(season.seasonId, episode)"
								class="chip"
								:class="kindClass(season.seasonId, episode)"
							>
								{{ kindLabel(season.seasonId, episode) }}
							</span>
							<span class="spacer"></span>
						</div>
						<div class="ep-meta">
							<span class="meta-item" :title="episode.fileName">
								<span class="meta-label">文件</span>{{ episode.fileName }}
							</span>
							<span
								v-if="!sameEpisode(index, episode.episodeId)"
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
				<li v-for="(warning, warningIndex) in season.warnings" :key="warningIndex">{{ warning }}</li>
			</ul>
		</div>
	</section>
</template>

<script setup lang="ts">
import type { BangumiPreviewDiff, BangumiCurrentSnapshot, BangumiSelection } from '@/utils/bangumiSync';
import type { BangumiPreviewEpisode, BangumiPreviewResult } from '@/@types/bangumi-sync';
import type { BangumiSeriesField } from './useBangumiSync';
import type { CheckboxValueType } from 'element-plus';
import type { EpisodeKind } from '~shared/episode-kind';
import { Right } from '@element-plus/icons-vue';
import { describeAlignment } from '@/utils/bangumiSync';

/**
 * 同步的第二步：逐项确认要写入的系列字段、季标题、集标题与整体重排。
 *
 * 一致性判断全部来自 `diff`：`true` 表示与当前值一致，勾选框禁用，
 * 行尾状态用绿/红语义色区分「保持当前值」与「将替换」。
 * 组件只回传勾选变化，不拼提交结构——那由 `buildApplyInput()` 统一负责。
 */
const props = defineProps<{
	fields: BangumiSeriesField[];
	preview: BangumiPreviewResult;
	diff: BangumiPreviewDiff;
	snapshot: BangumiCurrentSnapshot;
	selection: BangumiSelection;
	summaryText: string;
}>();

const emit = defineEmits<{
	(e: 'update-series', key: BangumiSeriesField['key'], value: boolean): void;
	(e: 'update-season-title', index: number, value: boolean): void;
	(e: 'update-season-order', index: number, value: boolean): void;
	(e: 'update-episode', index: number, episodeId: string, value: boolean): void;
	(e: 'select-all', index: number, checked: boolean): void;
}>();

const seriesChanged = computed(() => props.fields.filter((field) => !field.same).length);

function sameSeasonTitle(index: number) {
	return !!props.diff.seasons[index]?.title;
}

function sameSeasonOrder(index: number) {
	return !!props.diff.seasons[index]?.order;
}

function sameEpisode(index: number, episodeId: string) {
	return !!props.diff.seasons[index]?.episodes[episodeId];
}

/** 一集在本地的当前标题，用于「原集标题」提示 */
function localEpisodeTitle(seasonId: string, episodeId: string) {
	return props.snapshot.seasons.find((item) => item.seasonId === seasonId)?.episodeTitles[episodeId] ?? '';
}

/** 一集在本地的当前类型；快照里没有该集时按正片处理，与数据层默认值一致 */
function localEpisodeKind(seasonId: string, episodeId: string): EpisodeKind {
	return props.snapshot.seasons.find((item) => item.seasonId === seasonId)?.episodeKinds[episodeId] ?? 'main';
}

/**
 * 集类型标签文案。
 *
 * 只在「有分类信息」或「分类会变化」时出现：正片且本地也是正片没有任何信息量，
 * 返回空串让整块不渲染。变化态单独用「标为 / 改回」，让用户知道勾选后会发生什么。
 */
function kindLabel(seasonId: string, episode: BangumiPreviewEpisode) {
	if (episode.kind === 'unmatched') {
		return '未匹配';
	}
	if (episode.kind === localEpisodeKind(seasonId, episode.episodeId)) {
		return episode.kind === 'special' ? '特别篇' : '';
	}
	return episode.kind === 'special' ? '标为特别篇' : '改回正片';
}

function kindClass(seasonId: string, episode: BangumiPreviewEpisode) {
	if (episode.kind === 'unmatched') {
		return 'chip--unmatched';
	}
	if (episode.kind === localEpisodeKind(seasonId, episode.episodeId)) {
		return 'chip--special';
	}
	return episode.kind === 'special' ? 'chip--kind-add' : 'chip--kind-remove';
}

/** 一个季里有多少处会变化：集标题、季标题、重排分别计数 */
function seasonStatText(index: number) {
	const season = props.preview.seasons[index];
	if (!season) {
		return '';
	}
	const episodes = season.episodes.filter((episode) => !sameEpisode(index, episode.episodeId)).length;
	const count = episodes + (sameSeasonTitle(index) ? 0 : 1) + (sameSeasonOrder(index) ? 0 : 1);
	return count ? `将更新 ${count} 处` : '与当前一致';
}

function onSeriesChange(key: BangumiSeriesField['key'], value: CheckboxValueType) {
	emit('update-series', key, Boolean(value));
}

function onSeasonTitleChange(index: number, value: CheckboxValueType) {
	emit('update-season-title', index, Boolean(value));
}

function onSeasonOrderChange(index: number, value: CheckboxValueType) {
	emit('update-season-order', index, Boolean(value));
}

function onEpisodeChange(index: number, episodeId: string, value: CheckboxValueType) {
	emit('update-episode', index, episodeId, Boolean(value));
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;

/**
 * 页脚汇总移到这里：按钮旁边只留「应用 N 项」，
 * 分类明细放在内容顶部，滚动时不会跟着按钮跑掉，也不用为了它给宿主加插槽。
 */
.summary {
	margin: 0 0 10px;
	padding: 8px 12px;
	border-radius: 8px;
	background-color: map.get(token.$theme, 'd-4');
	@include text.text(0.75rem, 1.6, map.get(token.$theme, 'l-6'));
}

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
	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-9'));
	font-weight: 600;
}

.group-stat {
	margin-left: auto;
	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
}

/**
 * 集标签。
 *
 * 原来用胶囊 + `d-3` 底压在 `d-4` 分组上，只亮一档、11px 灰字，几乎看不出是标签。
 * 改成小圆角 + 实线描边 + 同色低透明底：靠「边框 + 色相」区分类型，不依赖明度差。
 */
.chip {
	flex-shrink: 0;
	padding: 0 6px;
	border: 1px solid transparent;
	border-radius: 4px;
	@include text.text(0.6875rem, 1.7);
	white-space: nowrap;
}

/** 中性标签：季头的对齐状态等，不承载语义色 */
.chip--muted {
	border-color: map.get(token.$theme, 'd-1');
	color: map.get(token.$theme, 'l-7');
}

/**
 * 合并集标签（`01-03` 一个文件装了连续几集）。
 *
 * 用主题色表达「信息」：这个文件覆盖了多集，和「特别篇」的分类语义分开。
 * 主题色是 `var(--theme)`，SCSS 侧拿不到色值、不能 color.change，只能用原生 color-mix
 * 让它按比例混进底色。覆盖了哪几集放在 title 里，标题本身已是模型合并的结果，不再展开。
 */
.chip--merge {
	border-color: color-mix(in srgb, var(--theme) 55%, transparent);
	background-color: color-mix(in srgb, var(--theme) 20%, transparent);
	color: map.get(token.$theme, 'l-9');
	font-weight: 500;
}

/** 特别篇：静态标记，琥珀色与正片区分；不用主题色以免和「合并」混淆 */
.chip--special {
	border-color: rgba(232, 178, 104, 0.45);
	background-color: rgba(232, 178, 104, 0.12);
	color: #e8b268;
}

/** 本次会新增特别篇：更实的边与底，强调「勾选后才会变」 */
.chip--kind-add {
	border-color: rgba(232, 178, 104, 0.9);
	background-color: rgba(232, 178, 104, 0.22);
	color: #f0c684;
	font-weight: 500;
}

/** 本次会把特别篇改回正片：中性灰，避免被误读成「新增」 */
.chip--kind-remove {
	border-color: map.get(token.$theme, 'd-1');
	color: map.get(token.$theme, 'l-6');
}

/** 未匹配：红色警示，与正片、特别篇都不混 */
.chip--unmatched {
	border-color: rgba(255, 143, 143, 0.45);
	background-color: rgba(255, 143, 143, 0.12);
	color: #ff8f8f;
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
	@include text.text(0.75rem, 1.6, map.get(token.$theme, 'l-7'));

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

/**
 * 一行变更：勾选框、字段名、当前值 → 新值、行尾状态。
 * 会覆盖当前值的行用浅底区分，不用左侧色条：一屏里连排五六个竖线非常吵。
 */
.row {
	display: grid;
	grid-template-columns: auto 4.2em minmax(0, 1fr) auto;
	align-items: center;
	gap: 0 10px;
	padding: 7px 10px;
	border-radius: 8px;
	@include text.text(0.8125rem, 1.5);
	transition: background-color 0.15s ease;

	& + .row {
		margin-top: 2px;
	}

	&:hover {
		background-color: map.get(token.$theme, 'd-3');
	}

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
	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-7'));
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
	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-8'));
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
	@include text.text(0.6875rem, 1.8, map.get(token.$theme, 'l-6'));
}

.long-text {
	flex: 1;
	min-width: 0;
	margin: 0;
	@include text.text(0.8125rem, 1.7);
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
	@include text.text(0.75rem, 1.5);

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
	@include text.text(0.75rem, 1.6, map.get(token.$theme, 'l-6'));
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

	// 标题按内容宽度收缩，特别篇标签才不会漂到行尾；剩余空间由 spacer 吃掉
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
	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-8'));
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
	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
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

.notes {
	margin: 10px 0 0;
	padding-left: 18px;
	@include text.text(0.75rem, 1.6, map.get(token.$theme, 'l-6'));
}
</style>
