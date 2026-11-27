<template>
	<AppearanceCard />
</template>

<script setup lang="ts">
import AppearanceCard from '@/components/setting/AppearanceCard.vue';

definePage({
	name: 'SettingAppearance',
	meta: {
		title: '设置 · 外观',
	},
});
</script>
