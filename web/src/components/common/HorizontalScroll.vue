<template>
    <div ref="container" class="horizontal-scroll" v-element-size="changeSize">
        <div
            class="horizontal-scroll-content"
            :style="{ '--width': size.width + 'px', '--height': size.height + 'px' }"
        >
            <div class="horizontal-scroll-inner">
                <slot></slot>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { vElementSize } from '@vueuse/components';

const container = useTemplateRef('container');
const size = ref({
    width: 0,
    height: 0,
});

function changeSize({ width, height }: { width: number; height: number }) {
    size.value = { width, height };
}

onMounted(() => {
    if (container.value) {
        const rect = container.value.getBoundingClientRect();
        size.value = { width: rect.width, height: rect.height };
    }
});
</script>

<style scoped lang="scss">
.horizontal-scroll {
    width: 100%;
    height: 100%;
    position: relative;
}

.horizontal-scroll-content {
    width: var(--height);
    height: var(--width);
    position: absolute;
    top: var(--height);
    left: 0;
    transform-origin: top left;
    transform: rotate(-90deg);
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
        display: none;
    }
}

.horizontal-scroll-inner {
    min-width: var(--width);
    height: var(--height);
    position: absolute;
    top: 0;
    left: var(--height);
    transform-origin: top left;
    transform: rotate(90deg);
}
</style>
