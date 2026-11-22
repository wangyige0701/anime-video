<template>
	<div class="filter-options">
		<button
			v-for="option in props.options"
			:key="option.id"
			type="button"
			class="option"
			:class="{ active: props.modelValue.includes(option.id) }"
			@click="toggle(option.id)"
		>
			{{ option.name }}
		</button>
	</div>
</template>

<script setup lang="ts">
/**
 * 通用多选标签组。
 *
 * 标签过滤与状态过滤的交互完全一致，只差数据源，因此抽成同一组件，
 * 由调用方传入选项集合与当前选中值。
 */
const props = defineProps<{
	/** 可选项目集合 */
	options: ReadonlyArray<{ id: number; name: string }>;
	/** 当前选中的 ID 集合，空数组表示不过滤 */
	modelValue: number[];
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: number[]): void;
}>();

/** 点击切换选中状态：已选中则移除，未选中则追加 */
function toggle(id: number) {
	const selected = props.modelValue.includes(id)
		? props.modelValue.filter((item) => item !== id)
		: [...props.modelValue, id];
	emit('update:modelValue', selected);
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.filter-options {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 8px;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;
	&::-webkit-scrollbar {
		display: none;
	}
}

.option {
	flex: 0 0 auto;
	cursor: pointer;
	padding: 4px 10px;
	font-size: 0.8125rem;
	line-height: 1.2;
	color: map.get(token.$theme, 'l-8');
	background-color: transparent;
	border: 1px solid map.get(token.$theme, 'd-3');
	border-radius: 5px;
	transition:
		color 0.2s ease,
		background-color 0.2s ease,
		border-color 0.2s ease;
	&:hover {
		color: map.get(token.$theme, 'l-9');
		background-color: map.get(token.$theme, 'd-3');
		border-color: map.get(token.$theme, 'l-2');
	}
	&.active {
		color: #fff;
		background-color: map.get(token.$theme, 'primary');
		border-color: map.get(token.$theme, 'l-5');
	}
}
</style>
