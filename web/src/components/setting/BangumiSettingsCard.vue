<template>
	<SettingSection
		title="Bangumi"
		hint="同步时从这里读取条目信息；Bangumi 要求请求携带自定义 User-Agent。"
		:configured="!!view?.bangumi.configured"
		:loading="loading"
	>
		<SettingField label="接口地址">
			<el-input v-model="form.baseUrl" placeholder="https://api.bgm.tv" clearable />
		</SettingField>

		<SettingField label="User-Agent">
			<el-input v-model="form.userAgent" placeholder="anime-video/1.0" clearable />
		</SettingField>

		<SettingAdvanced>
			<SettingField label="代理">
				<el-input v-model="form.proxy" placeholder="http://127.0.0.1:7890，留空直连" clearable />
			</SettingField>
			<SettingField label="超时">
				<el-input-number
					v-model="form.timeout"
					:min="1000"
					:max="300000"
					:step="1000"
					controls-position="right"
				/>
				<span class="unit">毫秒</span>
			</SettingField>
		</SettingAdvanced>

		<template #footer>
			<el-button type="primary" :loading="status.saving" :disabled="loading" @click="save">保存</el-button>
			<el-button
				:loading="status.probing"
				:disabled="loading || !view?.bangumi.configured"
				@click="testConnection"
			>
				测试连接
			</el-button>
			<span v-if="probeState" class="result" :class="{ failed: !probeState.ok }">{{ probeState.text }}</span>
		</template>
	</SettingSection>
</template>

<script setup lang="ts">
import type { SettingsView } from '@/api/settings';
import { probeBangumiSettings } from '@/api/settings';
import { useSettingsStore } from '@/stores/settings';
import { bangumiFormFrom, buildBangumiPatch, type BangumiFormValues } from '@/utils/settings';
import SettingAdvanced from './SettingAdvanced.vue';
import SettingField from './SettingField.vue';
import SettingSection from './SettingSection.vue';
import { useProbe } from './useProbe';

defineProps<{
	view: SettingsView | null;
	loading?: boolean;
}>();

const settingsStore = useSettingsStore();
const form = reactive<BangumiFormValues>(bangumiFormFrom(null));
const status = useVueStatusRef('saving', 'probing');
const { state: probeState, probe, reset: resetProbe } = useProbe(probeBangumiSettings);

/** 只在首次拿到设置时回填，避免保存 AI 分组后覆盖本组未保存的编辑 */
let initialized = false;
watch(
	() => settingsStore.view,
	(view) => {
		if (view && !initialized) {
			Object.assign(form, bangumiFormFrom(view));
			initialized = true;
		}
	},
	{ immediate: true },
);

async function save() {
	if (status.saving) {
		return;
	}
	const patch = buildBangumiPatch(settingsStore.view, form);
	if (!Object.keys(patch).length) {
		ElMessage.info('Bangumi 设置没有改动');
		return;
	}
	status.onSaving();
	try {
		const view = await settingsStore.save({ bangumi: patch });
		Object.assign(form, bangumiFormFrom(view));
		resetProbe();
		ElMessage.success('已保存');
	} finally {
		status.offSaving();
	}
}

/** 探测的是已保存的配置：页面上的未保存改动不参与 */
async function testConnection() {
	if (status.probing) {
		return;
	}
	status.onProbing();
	try {
		await probe();
	} finally {
		status.offProbing();
	}
}
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.unit {
	font-size: 0.75rem;
	color: map.get(token.$theme, 'l-6');
}

.result {
	font-size: 0.8125rem;
	color: map.get(token.$theme, 'l-8');

	&.failed {
		color: var(--danger-color, #f56c6c);
	}
}
</style>
