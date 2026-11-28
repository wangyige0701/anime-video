<template>
	<section class="match">
		<div v-for="(season, index) in props.seasons" :key="season.seasonId" class="season">
			<div class="season-head">
				<span class="path">{{ season.path }}</span>
				<span class="meta">{{ describeFiles(season) }}</span>
			</div>
			<div class="samples">{{ season.sampleFiles.join(' / ') }}</div>
			<el-select
				class="candidates"
				multiple
				filterable
				clearable
				popper-class="bangumi-popper"
				placeholder="选择 Bangumi 条目"
				:model-value="season.subjectIds"
				:multiple-limit="MAX_SUBJECTS_PER_SEASON"
				@update:model-value="onSubjectChange(index, $event)"
			>
				<el-option
					v-for="candidate in props.candidates"
					:key="candidate.id"
					:value="candidate.id"
					:label="candidateLabel(candidate)"
				>
					<span>{{ candidateLabel(candidate) }}</span>
					<span class="option-sub">{{ candidate.name }}</span>
				</el-option>
			</el-select>
		</div>
		<p v-if="!props.candidates.length && !props.matching" class="empty">
			没有搜索到候选条目，请手动在 Bangumi 确认条目 ID 后重试。
		</p>
		<ul v-if="props.notes.length" class="notes">
			<li v-for="(note, index) in props.notes" :key="index">{{ note }}</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
import type { BangumiCandidate, BangumiMatchSeason } from '@/@types/bangumi-sync';
import { MAX_SUBJECTS_PER_SEASON } from '@/utils/bangumiSync';

/**
 * 同步的第一步：确认「本地季 → Bangumi 条目」的对应关系。
 *
 * 只负责展示建议与收集用户改写，候选条目以受控方式回传，
 * `seasons` 由外层持有，组件不改写传入的数组。
 */
const props = defineProps<{
	seasons: BangumiMatchSeason[];
	candidates: BangumiCandidate[];
	notes: string[];
	matching: boolean;
}>();

const emit = defineEmits<{
	(e: 'update-subjects', index: number, subjectIds: number[]): void;
}>();

function onSubjectChange(index: number, subjectIds: number[]) {
	emit('update-subjects', index, subjectIds ?? []);
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
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;

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

	.path {
		@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-9'));
	}

	.meta {
		@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
	}
}

.samples {
	margin: 5px 0 10px;
	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
	word-break: break-all;
}

.candidates {
	width: 100%;
}

.empty {
	margin: 0;
	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-6'));
}

.notes {
	margin: 10px 0 0;
	padding-left: 18px;
	@include text.text(0.75rem, 1.6, map.get(token.$theme, 'l-6'));
}
</style>

<style lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;

// 下拉面板挂载在 body 上，作用域样式命中不到；主题由 assets/elements/select.scss 统一处理，
// 这里只保留候选条目的业务排版
body .el-popper.bangumi-popper {
	.option-sub {
		margin-left: 8px;
		@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-5'));
	}
}
</style>
