<template>
	<BangumiSettingsCard :view="view" :loading="status.loading" />
</template>

<script setup lang="ts">
import BangumiSettingsCard from '@/components/setting/BangumiSettingsCard.vue';
import { useSettingsStore } from '@/stores/settings';

definePage({
	name: 'SettingBangumi',
	meta: {
		title: '设置 · Bangumi',
	},
});

const settingsStore = useSettingsStore();
const view = computed(() => settingsStore.view);
const status = useVueStatusRef('loading').onLoading();

onMounted(async () => {
	try {
		await settingsStore.ensure();
	} finally {
		status.offLoading();
	}
});
</script>
