<template>
	<SettingSection
		title="AI 接口"
		hint="用于同步时的季映射、标签识别与剧集对齐，需兼容 OpenAI 的 chat/completions 协议。"
		:configured="!!view?.ai.configured"
		:loading="loading"
	>
		<SettingField label="接口地址">
			<el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" clearable />
		</SettingField>

		<SettingField label="模型">
			<el-input v-model="form.model" placeholder="deepseek-chat" clearable />
		</SettingField>

		<SettingField label="密钥">
			<div class="secret">
				<el-input
					v-if="apiKeyMode === 'replace'"
					v-model="apiKeyDraft"
					type="password"
					show-password
					placeholder="粘贴新的 API Key"
					clearable
				/>
				<span v-else-if="apiKeyMode === 'clear'" class="secret-state">保存后清除密钥</span>
				<span v-else class="secret-state">
					{{ view?.ai.hasApiKey ? `已设置 ${view.ai.apiKeyMasked}` : '未设置' }}
				</span>
				<div class="secret-actions">
					<template v-if="apiKeyMode === 'replace'">
						<el-button text @click="cancelReplace">取消</el-button>
					</template>
					<template v-else-if="apiKeyMode === 'clear'">
						<el-button text @click="apiKeyMode = 'keep'">撤销</el-button>
					</template>
					<template v-else>
						<el-button text @click="startReplace">替换</el-button>
						<el-button v-if="view?.ai.hasApiKey" text type="danger" @click="apiKeyMode = 'clear'"
							>清除</el-button
						>
					</template>
				</div>
			</div>
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
			<el-button :loading="status.probing" :disabled="loading || !view?.ai.configured" @click="testConnection"
				>测试连接</el-button
			>
			<span v-if="probeState" class="result" :class="{ failed: !probeState.ok }">{{ probeState.text }}</span>
		</template>
	</SettingSection>
</template>

<script setup lang="ts">
import type { SettingsView } from '@/api/settings';
import { probeAiSettings } from '@/api/settings';
import { useSettingsStore } from '@/stores/settings';
import { aiFormFrom, buildAiPatch, type AiFormValues, type ApiKeyIntent } from '@/utils/settings';
import SettingAdvanced from './SettingAdvanced.vue';
import SettingField from './SettingField.vue';
import SettingSection from './SettingSection.vue';
import { useProbe } from './useProbe';

defineProps<{
	view: SettingsView | null;
	loading?: boolean;
}>();

const settingsStore = useSettingsStore();
const form = reactive<AiFormValues>(aiFormFrom(null));
/** 密钥只走显式动作：输入框永不回填明文 */
const apiKeyMode = ref<ApiKeyIntent['type']>('keep');
const apiKeyDraft = ref('');
const status = useVueStatusRef('saving', 'probing');
const { state: probeState, probe, reset: resetProbe } = useProbe(probeAiSettings);

/**
 * 只在首次拿到设置时回填表单。
 *
 * 保存另一个分组后 store 会更新视图，若无条件回填会丢掉本组未保存的编辑。
 * 本组保存成功后由 `save()` 自己回填。
 */
let initialized = false;
watch(
	() => settingsStore.view,
	(view) => {
		if (view && !initialized) {
			resetForm(view);
			initialized = true;
		}
	},
	{ immediate: true },
);

function resetForm(view: SettingsView | null) {
	Object.assign(form, aiFormFrom(view));
	apiKeyMode.value = 'keep';
	apiKeyDraft.value = '';
}

function startReplace() {
	apiKeyMode.value = 'replace';
	apiKeyDraft.value = '';
}

function cancelReplace() {
	apiKeyMode.value = 'keep';
	apiKeyDraft.value = '';
}

function apiKeyIntent(): ApiKeyIntent {
	if (apiKeyMode.value === 'clear') {
		return { type: 'clear' };
	}
	if (apiKeyMode.value === 'replace') {
		return { type: 'replace', value: apiKeyDraft.value };
	}
	return { type: 'keep' };
}

async function save() {
	if (status.saving) {
		return;
	}
	const patch = buildAiPatch(settingsStore.view, form, apiKeyIntent());
	if (!Object.keys(patch).length) {
		ElMessage.info('AI 设置没有改动');
		return;
	}
	status.onSaving();
	try {
		const view = await settingsStore.save({ ai: patch });
		resetForm(view);
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

.secret {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;

	.el-input {
		flex: 1;
	}

	.secret-state {
		font-size: 0.8125rem;
		color: map.get(token.$theme, 'l-8');
	}

	.secret-actions {
		display: flex;
		align-items: center;
		margin-left: auto;
	}
}

// 文本按钮的默认文字色是主色，在深色底上几乎看不见；只调整无色按钮，danger 保持不变
:deep(.el-button.is-text:not(.el-button--danger)) {
	--el-button-text-color: #{map.get(token.$theme, 'l-8')};
	--el-button-hover-text-color: #{map.get(token.$theme, 'l-9')};
	--el-button-hover-bg-color: #{map.get(token.$theme, 'l-2')};
}

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
