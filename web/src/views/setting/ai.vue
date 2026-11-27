<template>
	<AiSettingsCard :view="view" :loading="status.loading" />
</template>

<script setup lang="ts">
import AiSettingsCard from '@/components/setting/AiSettingsCard.vue';
import { useSettingsStore } from '@/stores/settings';

definePage({
	name: 'SettingAi',
	meta: {
		title: '设置 · AI 接口',
	},
});

const settingsStore = useSettingsStore();
const view = computed(() => settingsStore.view);
const status = useVueStatusRef('loading').onLoading();

onMounted(async () => {
	try {
		// 已有视图时立即返回；首次进入才真正发请求
		await settingsStore.ensure();
	} finally {
		status.offLoading();
	}
});
</script>
