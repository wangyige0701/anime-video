<template>
	<SettingSection title="外观" hint="主题只影响当前浏览器，点击立即生效。" :meta="meta">
		<div class="themes">
			<button
				v-for="item in THEME_OPTIONS"
				:key="item.value"
				type="button"
				class="theme"
				:class="{ active: current === item.value }"
				:aria-pressed="current === item.value"
				@click="selectTheme(item.value)"
			>
				<span class="swatch" :style="{ backgroundColor: item.color }">
					<el-icon v-if="current === item.value"><Check /></el-icon>
				</span>
				<span class="name">{{ item.label }}</span>
			</button>
		</div>
	</SettingSection>
</template>

<script setup lang="ts">
import { Check } from '@element-plus/icons-vue';
import { THEME_OPTIONS, type Theme } from '@/config/theme';
import { useThemeStore } from '@/stores/theme';
import SettingSection from './SettingSection.vue';

const themeStore = useThemeStore();
const current = computed(() => themeStore.theme);

const meta = computed(() => [
	{
		label: '当前主题',
		value: THEME_OPTIONS.find((item) => item.value === current.value)?.label ?? '—',
	},
]);

function selectTheme(theme: Theme) {
	if (theme === current.value) {
		return;
	}
	themeStore.setTheme(theme);
}
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.themes {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.theme {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid transparent;
	border-radius: token.$radius-lg;
	background: none;
	color: map.get(token.$theme, 'l-7');
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		border-color 0.18s ease,
		color 0.18s ease;

	&:hover {
		color: #fff;
		background-color: rgba(255, 255, 255, 0.06);
	}

	&.active {
		color: #fff;
		border-color: rgba(255, 255, 255, 0.18);
		background-color: rgba(255, 255, 255, 0.08);
	}

	&:focus-visible {
		outline: none;
		border-color: map.get(token.$theme, 'l-7');
	}
}

.swatch {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;

	@include text.text(14px, 1, #fff);

	box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16);
	transition: transform 0.18s ease;
}

.theme.active .swatch {
	transform: scale(1.06);
}

.name {
	@include text.text(0.75rem, 1);
}
</style>
