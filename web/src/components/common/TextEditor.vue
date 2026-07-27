<template>
	<div class="editor">
		<span
			ref="editor"
			class="content"
			:contenteditable="props.editable && status.editor && !props.disabled && !props.loading"
			:data-loading="props.loading"
			@blur="onBlur"
			@paste.prevent="paster"
		>
			{{ props.value || '' }}
		</span>

		<div v-if="props.loading" class="loading">
			<el-icon class="is-loading">
				<Loading />
			</el-icon>
		</div>

		<el-button
			v-if="props.showEditIcon && props.editable && !status.editor && !props.disabled && !props.loading"
			class="edit icon"
			@click.stop="onEdit"
		>
			<el-icon size="0.9em">
				<Edit />
			</el-icon>
		</el-button>
	</div>
</template>

<script setup lang="ts">
import { Edit, Loading } from '@element-plus/icons-vue';

const props = withDefaults(
	defineProps<{
		loading?: boolean;
		disabled?: boolean;
		editable?: boolean;
		value?: string;
		showEditIcon?: boolean;
	}>(),
	{
		loading: false,
		disabled: false,
		editable: true,
		showEditIcon: true,
	},
);
const emit = defineEmits<{
	(e: 'change', value: string): void;
	(e: 'blur', value: string): void;
}>();

let descriptionText: Text | null = null;
const editor = useTemplateRef('editor');
const status = useVueStatusRef('editor');

function paster(e: ClipboardEvent) {
	const text = e.clipboardData?.getData?.('text/plain');
	if (text) {
		const selection = window.getSelection();
		if (!selection?.rangeCount) {
			return;
		}
		const range = selection.getRangeAt(0);
		range.deleteContents();
		descriptionText = document.createTextNode(text);
		range.insertNode(descriptionText);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

async function onEdit() {
	if (props.loading || props.disabled) {
		return;
	}
	status.onEditor();
	await nextTick();
	focusEditor();
}

function onBlur() {
	const text = editor.value?.textContent || '';
	emit('blur', text);
	status.offEditor();
	if (descriptionText) {
		descriptionText.remove();
		descriptionText = null;
	}
}

function focusEditor() {
	if (editor.value) {
		const el = editor.value;
		el.focus();

		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);

		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}
}

defineExpose({
	edit: onEdit,
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.editor {
	--inner-padding: 5px;
	font-size: inherit;
	color: inherit;
	border-radius: token.$radius-ex-sm;
	border: 1px solid var(--editor-border-color, transparent);
	transition: border-color 0.2s ease;
	position: relative;
	&:has(.content[contenteditable='true'], .content[data-modify='true']) {
		--editor-border-color: token.$var-primary-color;
		padding: 0;
	}
}

.content {
	padding: 0;
	outline: none;
	border: none;
	&[contenteditable='true'],
	&[data-modify='true'] {
		display: inline-block;
		width: 100%;
		padding: var(--inner-padding);
	}
}

.edit {
	height: auto;
	display: inline-flex;
	padding: 2px;
	margin-left: 5px;
}

.loading {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	position: absolute;
	inset: 0;
	background-color: rgba($color: #fff, $alpha: 0.3);
	border-radius: token.$radius-ex-sm;
	color: map.get(token.$theme, 'primary');
	font-size: 1.5rem;
}
</style>
