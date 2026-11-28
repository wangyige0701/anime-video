import { createPinia } from 'pinia';

/**
 * 全局唯一的 Pinia 实例。
 *
 * `openDialog()` 打开的对话框挂在一个独立的 Vue 应用里（不在主应用的组件树内），
 * 只有复用同一个实例，对话框内容才能读到主应用已经初始化的数据与状态。
 */
export const pinia = createPinia();
