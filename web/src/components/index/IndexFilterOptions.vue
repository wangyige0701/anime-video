<template>
	<div
		ref="root"
		class="filter-options"
		:class="{ expandable: expandable, expanded: expanded }"
		@pointerenter="hovering = true"
		@pointerleave="hovering = false"
	>
		<div ref="row" class="row">
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
	</div>
</template>

<script setup lang="ts">
/**
 * 通用多选标签组。
 *
 * 标签过滤与状态过滤的交互完全一致，只差数据源，因此抽成同一组件，
 * 由调用方传入选项集合与当前选中值。
 *
 * 标签数量变多后不能把过滤栏撑高：默认只显示一行（超出部分裁掉），
 * 鼠标悬浮时才向上浮出完整标签，交互与时间轴展开一致。
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

const root = useTemplateRef<HTMLElement>('root');
const row = useTemplateRef<HTMLElement>('row');
/** 指针是否停在标签组上 */
const hovering = ref(false);
/** 标签是否超过一行，只有超过时才需要悬浮展开 */
const expandable = ref(false);

const expanded = computed(() => expandable.value && hovering.value);

/**
 * 判断标签是否换行。
 *
 * 收起态使用「允许换行 + 最大高度一行 + 溢出隐藏」，
 * 因此 `scrollHeight` 大于可视高度就说明存在第二行；展开态是绝对定位，
 * 测量结果没有意义，直接跳过。
 */
function measure() {
	const element = row.value;
	if (!element || expanded.value) {
		return;
	}
	expandable.value = element.scrollHeight > element.clientHeight + 1;
}

let observer: ResizeObserver | undefined;

onMounted(() => {
	measure();
	// 窗口缩放、过滤栏宽度变化都会影响是否换行
	observer = new ResizeObserver(() => measure());
	if (root.value) {
		observer.observe(root.value);
	}
});

onBeforeUnmount(() => {
	observer?.disconnect();
	observer = undefined;
});

// 选项集合变化后按钮数量改变，需要重新判断是否超出单行
watch(
	() => props.options.length,
	() => nextTick(measure),
);

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
	position: relative;
	width: 100%;
	height: 26px;
}

.row {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	overflow: hidden;
	// 收起态只允许一行，超出部分被裁掉
	max-height: 26px;
}

// 超过一行时悬浮展开，向上浮出完整标签，不推挤列表
.filter-options.expanded .row {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	max-height: none;
	overflow: visible;
	padding: 8px;
	background-color: map.get(token.$theme, 'sidebar-bg');
	border: 1px solid map.get(token.$theme, 'd-3');
	border-radius: 8px;
	box-shadow: 0 -4px 16px map.get(token.$theme, 'd-4');
	backdrop-filter: blur(8px);
}

// 被裁掉的一侧加渐隐，提示还有更多标签可以悬浮查看
.filter-options.expandable:not(.expanded)::after {
	content: '';
	position: absolute;
	top: 0;
	right: 0;
	width: 48px;
	height: 26px;
	background: linear-gradient(90deg, transparent, map.get(token.$theme, 'sidebar-bg'));
	pointer-events: none;
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
