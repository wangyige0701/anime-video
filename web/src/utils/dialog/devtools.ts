import type { App } from 'vue';

/**
 * Vue Devtools 会为每个挂载的应用在窗口上压一条记录（`__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__`）。
 *
 * 对话框每次打开都新建一个应用，应用卸载后这条记录不会自己消失：
 * 每个条目都抓着应用实例与整棵组件树，反复开关对话框时内存和页面卡顿会越来越明显。
 * 所以这里在卸载前主动把它摘掉。
 */
interface DevtoolsBufferEntry {
	app?: unknown;
}

type DevtoolsWindow = Window & {
	__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__?: Array<DevtoolsBufferEntry | DevtoolsBufferEntry[]>;
};

/**
 * 从 devtools 缓冲区里摘掉指定应用。
 *
 * 条目形状在不同版本里不同：有的是 `[descriptor]`，有的是 descriptor 本身，
 * 因此统一按「数组取第一个元素」处理。返回是否真的移除了条目。
 */
export function removeDevtoolsApp(buffer: unknown, app: unknown) {
	if (!Array.isArray(buffer)) {
		return false;
	}
	const index = buffer.findIndex((entry) => {
		const descriptor = Array.isArray(entry) ? entry[0] : entry;
		return (descriptor as DevtoolsBufferEntry | undefined)?.app === app;
	});
	if (index === -1) {
		return false;
	}
	buffer.splice(index, 1);
	return true;
}

/**
 * 清理当前应用在 devtools 缓冲区里的记录。
 *
 * 只在开发环境执行：生产构建没有 Devtools，`import.meta.env.DEV` 为常量，
 * 这段代码会被整体摇掉，不会进包。
 */
export function releaseDevtoolsApp(app: App) {
	if (!import.meta.env.DEV) {
		return;
	}
	const buffer = (window as DevtoolsWindow).__VUE_DEVTOOLS_KIT_PLUGIN_BUFFER__;
	removeDevtoolsApp(buffer, app);
}
