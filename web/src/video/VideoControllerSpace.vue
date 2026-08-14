<template>
	<el-space :size="20">
		<template v-for="vnode in render">
			<el-tooltip
				ref="tooltips"
				:content="vnode.props?.['data-tooltip'] || ''"
				:disabled="vnode.props?.['data-disabled'] ?? !vnode.props?.['data-tooltip']"
				:placement="vnode.props?.['data-placement'] ?? 'top'"
				:append-to="tooltipContainer || 'body'"
				:hide-after="0"
				:offset="25"
				:show-arrow="false"
				:fallback-placements="['top']"
				:popper-options="popperOptions"
			>
				<div class="tip-wrap">
					<component :is="vnode" />
				</div>
			</el-tooltip>
		</template>
	</el-space>
</template>

<script setup lang="ts">
const props = defineProps<{
	tooltipContainer?: HTMLElement | null;
}>();

const slots = useSlots();
const tooltips = useTemplateRef('tooltips');
const popperOptions = { strategy: 'fixed' as const };

const render = computed(() => {
	if (!slots.default) {
		return [];
	}
	return slots.default();
});

function updatePoppers() {
	tooltips.value?.forEach((tooltip) => tooltip?.updatePopper());
}

defineExpose({ updatePoppers });
</script>

<style scoped lang="scss">
.tip-wrap {
	display: inline-flex;
}
</style>
