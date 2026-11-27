import { getSettings, saveSettings, type SettingsPatch, type SettingsView } from '@/api/settings';

/**
 * 用户设置的前端缓存。
 *
 * 详情页只用 `syncAvailable` 决定是否展示同步入口，设置页负责读写。
 * 首次读取成功后一直复用：设置页保存会写回新视图，不需要其它页面再拉一次。
 */
export const useSettingsStore = defineStore('settings', () => {
	const view = ref<SettingsView | null>(null);
	let pending: Promise<SettingsView | null> | null = null;

	const syncAvailable = computed(() => view.value?.syncAvailable ?? false);

	/** 加载中状态由调用方的 `useVueStatusRef` 管理，store 不重复维护一个布尔值 */
	async function refresh() {
		try {
			view.value = await getSettings();
			return view.value;
		} catch {
			// 网络层错误已由 api.ts 统一提示；这里保持「未知 = 不展示入口」，不阻断页面
			return null;
		}
	}

	/** 已有结果直接返回；并发调用共用同一个请求 */
	function ensure() {
		if (view.value) {
			return Promise.resolve(view.value);
		}
		pending ??= refresh().finally(() => {
			pending = null;
		});
		return pending;
	}

	async function save(patch: SettingsPatch) {
		view.value = await saveSettings(patch);
		return view.value;
	}

	return {
		view,
		syncAvailable,
		refresh,
		ensure,
		save,
	};
});
