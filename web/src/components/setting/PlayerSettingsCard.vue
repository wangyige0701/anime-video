<template>
	<SettingSection title="播放器" hint="这些偏好保存在本机，播放时立即生效，不需要保存。" :meta="meta">
		<SettingField label="默认音量" hint="进入新剧集时的初始音量">
			<el-slider v-model="volume" class="el-slider--panel" :min="0" :max="100" :step="5" />
			<span class="value">{{ volume }}%</span>
		</SettingField>

		<SettingField label="自动连播" hint="当前剧集播完自动切到下一集">
			<el-switch v-model="autoPlay" />
		</SettingField>

		<SettingField label="字幕默认开启" hint="剧集有字幕轨时自动加载并显示">
			<el-switch v-model="subtitle" />
		</SettingField>
	</SettingSection>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';
import SettingField from './SettingField.vue';
import SettingSection from './SettingSection.vue';

const playerStore = usePlayerStore();

// 直接绑定 store：播放器与设置页共享同一份状态，改动即时生效并写入本机存储
const volume = computed({
	get: () => playerStore.volume,
	set: (value: number) => playerStore.setVolume(value),
});
const autoPlay = computed({
	get: () => playerStore.isAutoPlay,
	set: (value: boolean) => playerStore.setIsAutoPlay(value),
});
const subtitle = computed({
	get: () => playerStore.isSubtitleTrack,
	set: (value: boolean) => playerStore.setIsSubtitleTrack(value),
});

const meta = computed(() => [
	{ label: '默认音量', value: `${playerStore.volume}%` },
	{ label: '自动连播', value: playerStore.isAutoPlay ? '开启' : '关闭' },
	{ label: '字幕', value: playerStore.isSubtitleTrack ? '默认开启' : '默认关闭' },
]);
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.value {
	flex: 0 0 42px;

	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-9'));

	font-variant-numeric: tabular-nums;
	text-align: right;
}
</style>
