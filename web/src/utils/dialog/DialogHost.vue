<template>
	<el-config-provider :locale="zhCn">
		<el-dialog
			v-bind="props.dialogProps"
			:model-value="props.visible"
			@update:model-value="onVisibleChange"
			@closed="emit('closed')"
		>
			<component :is="props.component" v-bind="props.componentProps" />

			<template v-if="visibleButtons.length" #footer>
				<div class="dialog-footer">
					<el-button
						v-for="button in visibleButtons"
						:key="button.key"
						v-bind="buttonAttrs(button)"
						@click="button.onClick?.()"
					>
						{{ button.content }}
					</el-button>
				</div>
			</template>
		</el-dialog>
	</el-config-provider>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import type { DialogButtonConfig } from './types';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

/**
 * 对话框宿主。
 *
 * 只把 el-dialog 与「内容组件 + 页脚按钮」接起来：
 * - 可见性归 `openDialog()` 所有，用户关窗时通过 `update:visible` 交回去；
 * - 页脚按钮是纯数据声明，内容组件用 `setButtons()` 整组替换；
 * - 宿主不认识任何业务，内容全部来自外部组件。
 *
 * 宿主动态挂载在独立的应用里，所以语言要单独配置一次：
 * 它不在 `App.vue` 的 `el-config-provider` 之下。
 */
const props = defineProps<{
	visible: boolean;
	component: Component;
	componentProps?: Record<string, unknown>;
	dialogProps?: Record<string, unknown>;
	buttons?: DialogButtonConfig[];
}>();

const emit = defineEmits<{
	(e: 'update:visible', visible: boolean): void;
	(e: 'closed'): void;
}>();

const visibleButtons = computed(() => (props.buttons ?? []).filter((button) => button.visible !== false));

function onVisibleChange(visible: boolean) {
	emit('update:visible', visible);
}

/** `key`、文案与回调不能下发给 el-button：它们分别属于列表 diff、插槽内容和事件绑定 */
function buttonAttrs(button: DialogButtonConfig) {
	const attrs = { ...button } as Partial<DialogButtonConfig>;
	delete attrs.key;
	delete attrs.content;
	delete attrs.visible;
	delete attrs.onClick;
	return attrs;
}
</script>

<style scoped lang="scss">
.dialog-footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 10px;
}
</style>
