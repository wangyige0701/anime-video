<template>
	<PlayerSettingsCard />
</template>

<script setup lang="ts">
import PlayerSettingsCard from '@/components/setting/PlayerSettingsCard.vue';

definePage({
	name: 'SettingPlayer',
	meta: {
		title: '设置 · 播放器',
	},
});
</script>
