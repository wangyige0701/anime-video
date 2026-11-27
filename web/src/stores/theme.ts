import { Theme } from '@/config/theme';
import { readStoredTheme, writeStoredTheme } from '@/utils/themeStorage';

export const useThemeStore = defineStore('theme', () => {
	// 同步读取：主题必须在首帧前挂到根节点，异步存储会让页面先闪一下默认配色
	const themeValue = ref<Theme>(readStoredTheme() ?? Theme.Xingyezi);

	function setTheme(theme: Theme) {
		themeValue.value = theme;
		// 用枚举值而不是 for-in 的键：字符串枚举的键是 `Xingyezi`，与 class 名 `xingyezi` 不同
		for (const value of Object.values(Theme)) {
			document.documentElement.classList.remove(value);
		}
		document.documentElement.classList.add(theme);
		writeStoredTheme(theme);
	}

	function initialize() {
		setTheme(themeValue.value);
	}

	return { theme: themeValue, setTheme, initialize };
});
