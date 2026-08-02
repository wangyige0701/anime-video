<template>
	<div ref="cotnainer" class="video-progress_container"></div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '@/stores/player';

const playerStore = usePlayerStore();
</script>

<style scoped lang="scss"></style>
