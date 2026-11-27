<template>
	<SettingSection
		title="AI 接口"
		hint="同步时用它做季映射、标签识别与剧集对齐，需要兼容 OpenAI 的 chat/completions 协议。"
		:state-label="props.view?.ai.configured ? '已配置' : '未配置'"
		:state-ok="!!props.view?.ai.configured"
		:meta="meta"
		:loading="props.loading"
	>
		<SettingField label="接口地址" hint="OpenAI 兼容的根地址，按服务商文档填写">
			<el-input v-model="form.baseUrl" class="el-input--panel" placeholder="https://api.deepseek.com" clearable />
		</SettingField>

		<SettingField label="模型" hint="请求体里的 model，需与服务端实际能力一致">
			<el-input v-model="form.model" class="el-input--panel" placeholder="deepseek-chat" clearable />
		</SettingField>

		<SettingField label="密钥" hint="只保存在本机，页面不回显明文">
			<div class="secret">
				<el-input
					v-if="apiKeyMode === 'replace'"
					v-model="apiKeyDraft"
					class="el-input--panel"
					type="password"
					show-password
					placeholder="粘贴新的 API Key"
				/>
				<span v-else-if="apiKeyMode === 'clear'" class="secret-state pending">保存后清除密钥</span>
				<span v-else class="secret-state">
					{{ props.view?.ai.hasApiKey ? `已设置 ${props.view.ai.apiKeyMasked}` : '未设置' }}
				</span>

				<div class="secret-actions">
					<template v-if="apiKeyMode === 'replace'">
						<el-button size="small" text class="el-button--panel" @click="cancelReplace">取消</el-button>
					</template>
					<template v-else-if="apiKeyMode === 'clear'">
						<el-button size="small" text class="el-button--panel" @click="apiKeyMode = 'keep'"
							>撤销</el-button
						>
					</template>
					<template v-else>
						<el-button size="small" @click="startReplace">替换</el-button>
						<el-button
							v-if="props.view?.ai.hasApiKey"
							size="small"
							text
							class="el-button--panel"
							type="danger"
							@click="apiKeyMode = 'clear'"
						>
							清除
						</el-button>
					</template>
				</div>
			</div>
		</SettingField>

		<SettingAdvanced summary="代理 · 超时">
			<SettingField label="代理" hint="留空直连，只作用于 AI 请求">
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
				:disabled="props.loading || !props.view?.ai.configured"
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
import { probeAiSettings } from '@/api/settings';
import { useSettingsStore } from '@/stores/settings';
import { aiFormFrom, buildAiPatch, type AiFormValues, type ApiKeyIntent } from '@/utils/settings';
import SettingAdvanced from './SettingAdvanced.vue';
import SettingField from './SettingField.vue';
import SettingSection from './SettingSection.vue';
import { useProbe } from './useProbe';

const props = defineProps<{
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

/** 头部摘要取已保存值，与表单里正在编辑的内容分开 */
const meta = computed(() => [
	{ label: '接口地址', value: props.view?.ai.baseUrl || '未填写' },
	{ label: '模型', value: props.view?.ai.model || '未填写' },
	{ label: '超时', value: props.view?.ai.timeout ? `${props.view.ai.timeout} ms` : '—' },
]);

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
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.secret {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	min-width: 0;

	.el-input {
		flex: 1;
	}
}

.secret-state {
	flex: 1;
	min-width: 0;

	@include text.text(0.8125rem, 1.5, map.get(token.$theme, 'l-9'));

	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;

	&.pending {
		color: var(--el-color-warning);
	}
}

.secret-actions {
	display: flex;
	gap: 6px;
	margin-left: auto;
}

.unit {
	flex: 0 0 auto;

	@include text.text(0.75rem, 1.5, map.get(token.$theme, 'l-6'));
}

.result {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-left: 4px;

	@include text.text(0.8125rem, 1.5, #8fd67a);

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
