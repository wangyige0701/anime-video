<template>
	<div class="description">
		<!-- 编辑入口放在标题行，避免按钮跟随段落文本移动，长描述时也始终固定在标题旁 -->
		<div class="header">
			<span class="title">剧情简介</span>
			<!-- 进入编辑或保存中时隐藏入口，保存完成后再出现 -->
			<el-button
				v-if="!editing && !status.modifyDescription"
				class="edit"
				text
				size="small"
				title="编辑剧情简介"
				:disabled="props.disabled"
				@click="editDescription"
			>
				<el-icon size="inherit"><Edit /></el-icon>
			</el-button>
		</div>
		<TextEditor
			ref="editorRef"
			v-model:editing="editing"
			:value="props.series.description"
			:loading="status.modifyDescription"
			:disabled="props.disabled"
			:hide-edit-icon="editing || status.modifyDescription"
			@blur="endEditDescription"
		/>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { Edit } from '@element-plus/icons-vue';

const props = defineProps<{
	series: Series;
	disabled: boolean;
}>();

const status = useVueStatusRef('modifyDescription');
/** 编辑器是否处于编辑态，由 TextEditor 的 v-model:editing 回传 */
const editing = ref(false);
/** 编辑器实例，仅用于从标题旁的按钮触发编辑 */
const editorRef = useTemplateRef('editorRef');

function editDescription() {
	if (editing.value) {
		return;
	}
	void editorRef.value?.edit();
}

/**
 * 提交描述。
 *
 * 空描述是合法状态（表示清空），不做非空拦截；去掉首尾空白后交给数据层，
 * 失败回滚由 `updateDescription()` 统一处理。
 */
async function endEditDescription(value: string) {
	status.onModifyDescription();
	await props.series.updateDescription(value.trim());
	status.offModifyDescription();
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.description {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: map.get(token.$theme, 'l-9');
	.header {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 4px;
	}
	.title {
		color: map.get(token.$theme, 'l-8');
		font-size: 0.75rem;
	}
	.edit {
		height: auto;
		padding: 2px;
		color: map.get(token.$theme, 'l-7');
		background-color: transparent;
		&:hover {
			color: map.get(token.$theme, 'l-9');
			background-color: transparent;
		}
	}
}
</style>
