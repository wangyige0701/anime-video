import { Theme } from '@/config/theme';

export const useThemeStore = defineStore('theme', () => {
	const themeValue = ref<Theme>(Theme.Xingyezi);

	function setTheme(theme: Theme) {
		themeValue.value = theme;
		for (const value in Theme) {
			document.documentElement.classList.remove(value);
		}
		document.documentElement.classList.add(theme);
	}

	function initialize() {
		setTheme(themeValue.value);
	}

	return { theme: themeValue, setTheme, initialize };
});
