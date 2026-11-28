import type { ButtonProps, DialogProps } from 'element-plus';
import type { Component } from 'vue';

/**
 * 页脚按钮声明。
 *
 * 在 el-button 的属性上补三样东西：唯一 `key`（重新声明按钮时用它做列表 diff）、
 * 文案（走插槽而不是属性）、以及是否渲染。
 */
export interface DialogButtonConfig extends Partial<ButtonProps> {
	/** 按钮标识，同一组按钮内唯一 */
	key: string;
	/** 按钮文案；为空时只渲染图标 */
	content?: string;
	/** 是否渲染，默认 true */
	visible?: boolean;
	/** 点击回调，宿主不预设任何「确认/取消」语义 */
	onClick?: () => void;
}

/**
 * `openDialog()` 的参数。
 *
 * 内容永远是组件：页面的结构、状态与请求都留在组件里，
 * 对话框本身只提供「打开 → resolve / reject」和页脚按钮的控制面。
 */
export interface OpenDialogOptions {
	/** 内容组件；会额外收到 `dialog` 属性（控制器） */
	component: Component;
	/** 透传给内容组件的属性 */
	componentProps?: Record<string, unknown>;
	/** el-dialog 的属性；`modelValue` 由对话框自己管理，不要传 */
	dialogProps?: Partial<DialogProps> & { class?: string | string[] };
	/** 标题，等价于 `dialogProps.title`，单独提出来省一层嵌套 */
	title?: string;
	/** 页脚的初始按钮，之后由内容组件用 `dialog.setButtons()` 整组改写 */
	buttons?: DialogButtonConfig[];
}
