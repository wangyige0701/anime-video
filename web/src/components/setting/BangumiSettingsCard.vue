<template>
	<SettingSection
		title="Bangumi"
		hint="同步时从这里读取条目与剧集信息；Bangumi 会拒绝没有自定义 User-Agent 的请求。"
		:state-label="props.view?.bangumi.configured ? '已配置' : '未配置'"
		:state-ok="!!props.view?.bangumi.configured"
		:meta="meta"
		:loading="props.loading"
	>
		<SettingField label="接口地址" hint="Bangumi 的公开 API 根地址">
			<el-input v-model="form.baseUrl" class="el-input--panel" placeholder="https://api.bgm.tv" clearable />
		</SettingField>

		<SettingField label="User-Agent" hint="Bangumi 要求能识别调用方的 UA">
			<el-input v-model="form.userAgent" class="el-input--panel" placeholder="anime-video/1.0" clearable />
		</SettingField>

		<SettingAdvanced summary="代理 · 超时">
			<SettingField label="代理" hint="留空直连，只作用于 Bangumi 请求">
				<el-input v-model="form.proxy" class="el-input--panel" placeholder="http://127.0.0.1:7890" clearable />
			</SettingField>
			<SettingField label="超时" hint="单次请求上限，1000 – 300000 毫秒">
				<el-input-number
					v-model="form.timeout"
					class="el-input-number--panel"
					:min="1000"
					:max="300000"
					:step="1000"
					controls-position="right"
					align="left"
				/>
				<span class="unit">毫秒</span>
			</SettingField>
		</SettingAdvanced>

		<template #footer>
			<el-button type="primary" :loading="status.saving" :disabled="props.loading" @click="save">
				保存
			</el-button>
			<el-button
				:loading="status.probing"
				:disabled="props.loading || !props.view?.bangumi.configured"
				@click="testConnection"
			>
				测试连接
			</el-button>
			<span v-if="probeState" class="result" :class="{ failed: !probeState.ok }">
				<i class="dot"></i>
				{{ probeState.text }}
			</span>
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

const props = defineProps<{
	view: SettingsView | null;
	loading?: boolean;
}>();

const settingsStore = useSettingsStore();
const form = reactive<BangumiFormValues>(bangumiFormFrom(null));
const status = useVueStatusRef('saving', 'probing');
const { state: probeState, probe, reset: resetProbe } = useProbe(probeBangumiSettings);

/** 头部摘要取已保存值，与表单里正在编辑的内容分开 */
const meta = computed(() => [
	{ label: '接口地址', value: props.view?.bangumi.baseUrl || '未填写' },
	{ label: 'User-Agent', value: props.view?.bangumi.userAgent || '未填写' },
	{ label: '超时', value: props.view?.bangumi.timeout ? `${props.view.bangumi.timeout} ms` : '—' },
]);

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
	flex: 0 0 auto;
	font-size: 0.75rem;
	color: map.get(token.$theme, 'l-6');
}

.result {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-left: 4px;
	font-size: 0.8125rem;
	color: #8fd67a;

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: currentColor;
	}

	&.failed {
		color: var(--el-color-danger);
	}
}
</style>
