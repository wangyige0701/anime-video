<template>
	<div class="detail-types" :class="{ visible: visible }">
		<el-popover
			ref="popover"
			placement="bottom-start"
			trigger="click"
			:show-arrow="false"
			popper-class="detail-metadata-popover"
			transition="popover-dropdown"
			:show-after="0"
			:hide-after="0"
			:disabled="series.typesRef"
			:width="300"
			v-model:visible="visible"
			@hide="updateTypes"
		>
			<template #reference>
				<div v-if="!selectedTypesNames.length" class="placeholder">选择类型</div>
				<div v-else class="types-container">
					<div v-for="name in selectedTypesNames" :key="name" class="type-selected-item">{{ name }}</div>
				</div>
			</template>

			<div class="types">
				<div
					v-for="type in seriesTypes"
					:key="type.id"
					class="type-item"
					:class="{ selected: selectedTypes.includes(type.id) }"
					@click.stop="change(type.id)"
				>
					{{ type.name }}
				</div>
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { seriesTypes } from '~config/seriesTypes';

const popover = useTemplateRef('popover');
const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const visible = ref(false);
const types = ref<number[]>([]);
const selectedTypes = ref<number[]>([]);
const selectedTypesNames = computed(
	() => types.value.map((type) => seriesTypes.find((t) => t.id === type)?.name).filter(Boolean) as string[],
);

watch(
	() => series.value.types,
	(newTypes) => {
		types.value = [...(newTypes || [])];
		selectedTypes.value = [...(newTypes || [])];
	},
	{ deep: true, immediate: true, flush: 'sync' },
);

function change(id: number) {
	if (selectedTypes.value.includes(id)) {
		selectedTypes.value = selectedTypes.value.filter((type) => type !== id);
	} else {
		selectedTypes.value.push(id);
	}
}

async function updateTypes() {
	if (isTypesSame()) {
		return;
	}
	popover.value?.hide();
	types.value = [...selectedTypes.value];
	try {
		await series.value.updateTypes(selectedTypes.value);
	} catch (error) {}
}

function isTypesSame() {
	const types = series.value.types || [];
	return selectedTypes.value.length === types.length && selectedTypes.value.every((type) => types.includes(type));
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use './metadata.scss' as *;
@use '@/scss/token.scss' as token;

.detail-types {
	@include metadata-item;
	@include metadata-content;
	cursor: pointer;
	padding-left: 5px;
	border-radius: 5px;
	border-radius: 5px;
	transition: background-color 0.2s ease;

	&:hover,
	&.visible {
		background-color: map.get(token.$theme, 'd-5');
	}
}

.placeholder {
	@include metadata-placeholder;
}

.types-container {
	cursor: pointer;
	max-width: 100%;
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 10px;
}

.type-selected-item {
	line-height: 1;
	font-size: 0.875rem;
	padding: 4px 8px;
	color: map.get(token.$theme, 'l-9');
	background-color: map.get(token.$theme, 'd-3');
	border: 1px solid map.get(token.$theme, 'l-2');
	border-radius: 5px;
}

.types {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 10px;
}

.type-item {
	cursor: pointer;
	padding: 4px 10px;
	line-height: 1;
	font-size: 0.875rem;
	color: map.get(token.$theme, 'l-8');
	background-color: transparent;
	border-radius: 5px;
	border: 1px solid map.get(token.$theme, 'd-3');
	transition:
		color 0.2s ease,
		background-color 0.2s ease,
		border-color 0.2s ease;

	&:hover {
		color: map.get(token.$theme, 'l-9');
		background-color: map.get(token.$theme, 'd-3');
		border-color: map.get(token.$theme, 'l-2');
	}

	&.selected {
		color: #fff;
		background-color: map.get(token.$theme, 'primary');
		border-color: map.get(token.$theme, 'l-5');
	}
}
</style>
