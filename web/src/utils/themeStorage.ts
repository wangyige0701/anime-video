import { Theme } from '@/config/theme';

const THEME_STORAGE_KEY = 'theme';

/**
 * 校验存储里的主题名。
 *
 * 只接受枚举内的值：用户手工改过 localStorage、或旧版本删掉过某个主题时，
 * 直接拿字符串当 class 会得到一个没有任何样式定义的根节点，表现为整站配色消失。
 */
export function parseTheme(value: string | null | undefined): Theme | null {
	if (!value) {
		return null;
	}
	const known = Object.values(Theme) as string[];
	return known.includes(value) ? (value as Theme) : null;
}

export function readStoredTheme(): Theme | null {
	try {
		return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
	} catch {
		return null;
	}
}

/**
 * 主题用同步 `localStorage` 而不是 `VideoInfoStorage`：
 * 它要在首帧前挂到 `documentElement` 上，异步读盘会让页面先闪一下默认配色。
 */
export function writeStoredTheme(theme: Theme): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// 隐私模式或存储被禁用时静默失败，主题仍在内存中生效
	}
}
