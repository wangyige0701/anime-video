<template>
	<div class="sync-dialog">
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

		<div v-loading="busy" class="body">
			<el-scrollbar max-height="calc(80vh - 150px)">
				<MatchStep
					v-if="step === 0"
					:seasons="seasons"
					:candidates="candidates"
					:notes="matchNotes"
					:matching="status.matching"
					@update-subjects="setSubjectIds"
				/>
				<PreviewStep
					v-else-if="preview && diff"
					:fields="seriesFields"
					:preview="preview"
					:diff="diff"
					:snapshot="props.snapshot"
					:selection="selection"
					:summary-text="summaryText"
					@update-series="setSeriesField"
					@update-season-title="setSeasonTitle"
					@update-season-order="setSeasonOrder"
					@update-episode="setEpisodeTitle"
					@select-all="setAllEpisodes"
				/>
			</el-scrollbar>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { BangumiCurrentSnapshot } from '@/utils/bangumiSync';
import type { DialogManager } from '@/utils/dialog';
import type { BangumiFooterKey } from '@/utils/bangumiSync';
import { Check, Right } from '@element-plus/icons-vue';
import MatchStep from './MatchStep.vue';
import PreviewStep from './PreviewStep.vue';
import { useBangumiSync } from './useBangumiSync';

/**
 * 同步对话框的内容：步骤条、两步面板与页脚按钮。
 *
 * 页面不写在这里——匹配与预览各是一个组件，流程与派生状态在 `useBangumiSync`。
 * 这里只做三件事：把状态接到子组件、按步骤改写页脚按钮、请求进行中禁止关闭。
 *
 * `seriesId` 与 `snapshot` 由调用方传入：对话框挂在独立的应用里，拿不到详情页的 provide。
 */
const props = defineProps<{
	seriesId: string;
	snapshot: BangumiCurrentSnapshot;
	dialog: DialogManager<number>;
}>();

const {
	status,
	step,
	busy,
	seasons,
	candidates,
	matchNotes,
	preview,
	diff,
	selection,
	seriesFields,
	summaryText,
	loadMatch,
	setSubjectIds,
	toMatchStep,
	loadPreview,
	submit,
	setSeriesField,
	setSeasonTitle,
	setSeasonOrder,
	setEpisodeTitle,
	setAllEpisodes,
	footer,
} = useBangumiSync(props);

/** 页脚按钮的行为：按钮集合由 `describeSyncFooter()` 决定，这里只按 key 接线 */
const actions: Record<BangumiFooterKey, () => void> = {
	cancel: () => props.dialog.cancel(),
	rematch: () => void loadMatch(),
	back: toMatchStep,
	preview: () => void loadPreview(),
	apply: () => void apply(),
};

async function apply() {
	const total = await submit();
	if (total) {
		props.dialog.confirm(total);
	}
}

watchEffect(() => {
	props.dialog.setButtons(footer.value.map((button) => ({ ...button, onClick: actions[button.key] })));
});

// 请求进行中只允许通过「取消」离开：结果要写回这个视图，关掉就再也看不到了
watchEffect(() => {
	if (busy.value) {
		props.dialog.unclosable();
	} else {
		props.dialog.closable();
	}
});

onMounted(() => {
	void loadMatch();
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;

/**
 * 步骤条自己拼，不用 el-steps 的 simple 模式：
 * 它把箭头画成两根 1px 斜线（`::before`/`::after`），和图标体系不搭、缩放后还发毛。
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
	@include text.text(0.875rem, 1.5, map.get(token.$theme, 'l-6'));
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
	@include text.text(0.6875rem, 1);
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
</style>
