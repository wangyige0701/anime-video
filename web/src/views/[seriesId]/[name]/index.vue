<template>
	<div class="detail">
		<div class="detail-container">
			<div class="detail-series-info">
				<div class="detail-series-left">
					<div class="detail-series-image-container">
						<template v-if="image">
							<img class="image" :src="image" :alt="series.name ?? ''" />
						</template>
						<template v-else-if="useVideoStore().isWaiting">
							<div class="image image-loading" style="min-height: calc(var(--image-width) * 1.1)"></div>
						</template>
					</div>
				</div>

				<div class="detail-series-content">
					<div class="detail-title">
						<span>{{ series.name ?? '' }}</span>
					</div>

					<div class="detail-desc">
						<span
							ref="descContent"
							class="detail-desc-content"
							:contenteditable="status.editDescription"
							:data-modify="status.modifyDescription"
							@blur="endEditDescription"
						>
							{{ series.description ?? '' }}
						</span>
						<template v-if="!status.editDescription && !status.modifyDescription">
							<span class="detail-desc-edit" @click="editDescription">
								<i class="icon-edit"></i>
							</span>
						</template>
					</div>
				</div>
			</div>

			<div class="detail-series-list"></div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '~types/videos';
import { useVideoStore } from '@/stores/video';
import { getSeriesPath } from '@/utils/series';
import { getImageUrl } from '~routes/server';
import { WebRoute } from '~routes/web';
import router from '@/router';

definePage({
	name: WebRoute.DETAIL,
});

const seriesId = useRoute().params.seriesId as string;
const status = useVueStatusRef('editDescription', 'modifyDescription');
const series = shallowRef<Series>({} as Series);
const descContent = useTemplateRef('descContent');
const image = computed(() => {
	if (series.value.images?.length) {
		return getImageUrl(getSeriesPath(series.value.path, series.value.images[0]!));
	}
	return '';
});

async function editDescription() {
	if (status.modifyDescription) {
		return;
	}
	status.onEditDescription();
	await nextTick();
	focusDescription();
}

async function endEditDescription() {
	if (!status.editDescription || !descContent.value) {
		return;
	}
	status.onModifyDescription();
	status.offEditDescription();
	const div = document.createElement('div');
	div.style.position = 'absolute';
	div.style.inset = '0';
	div.style.display = 'flex';
	div.style.alignItems = 'center';
	div.style.justifyContent = 'center';
	div.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
	div.style.borderRadius = '5px';
	const i = document.createElement('i');
	i.className = 'icon-loading loading-anime';
	i.style.color = 'var(--primary-color)';
	i.style.fontSize = '1.2em';
	div.appendChild(i);
	descContent.value.appendChild(div);
}

function focusDescription() {
	if (descContent.value) {
		const el = descContent.value;
		el.focus();

		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);

		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}
}

onMounted(async () => {
	const info = await useVideoStore().getSeriesInfo(seriesId);
	if (!info || !info.id) {
		router.push({ name: WebRoute.INDEX, replace: true });
		return;
	}
	series.value = info;
});
</script>

<style scoped lang="scss">
.detail {
	--container-padding: 10px;
	--image-width: 200px;
	width: 100%;
	height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
}

.detail-container {
	width: 100%;
	display: flex;
	flex-direction: column;
	padding: var(--container-padding);
}

.detail-series-info {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: flex-start;
	padding: var(--container-padding);
	border-radius: 10px;
	background-color: var(--detail-block-background-color);
}

.detail-series-left {
	width: var(--image-width);
	padding: var(--container-padding);
	overflow: hidden;
}

.detail-series-image-container {
	width: 100%;
	border-radius: 10px;
	overflow: hidden;
}

// 信息文本
.detail-series-content {
	display: flex;
	flex-direction: column;
	flex: 1;
	gap: calc(var(--container-padding) * 1.5);
	padding: var(--container-padding);
}

.detail-title {
	font-size: 1.5rem;
	color: #333;
}

// 描述
.detail-desc {
	--inner-padding: 5px;
	font-size: 1rem;
	color: #666;
	padding: var(--inner-padding);
	border-radius: 5px;
	position: relative;
	border: 1px solid transparent;
	transition: border-color 0.2s ease;
	&:has(.detail-desc-content[contenteditable='true'], .detail-desc-content[data-modify='true']) {
		padding: 0;
		border-color: var(--primary-color);
	}
}

.detail-desc-content {
	padding: 0;
	outline: none;
	border: none;
	&[contenteditable='true'],
	&[data-modify='true'] {
		display: inline-block;
		width: 100%;
		padding: var(--inner-padding);
	}
}

.detail-desc-edit {
	cursor: pointer;
	width: 1.5em;
	height: 1.5em;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 0.75rem;
	border-radius: 5px;
	transition:
		background-color 0.2s ease,
		color 0.2s ease;
	&:hover {
		background-color: var(--primary-color);
		color: #fff;
	}
}
</style>
