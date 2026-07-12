<template>
	<div class="app" :class="useDeviceStore().className">
		<main class="main">
			<router-view v-slot="{ Component }">
				<keep-alive :include="[WebRoute.INDEX]">
					<component :is="Component"></component>
				</keep-alive>
			</router-view>
		</main>
	</div>
</template>

<script setup lang="ts">
import { onBeforeMount } from 'vue';
import { WebRoute } from '~routes/web';
import { useVideoStore } from './stores/video';
import { useDeviceStore } from './stores/device';

onBeforeMount(async () => {
	await useVideoStore().initialize();
});
</script>

<style lang="scss">
.app {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.main {
	width: 100%;
	height: 100%;
	background-color: var(--background-color);
	padding: var(--side-float-padding);
	overflow: hidden;
}
</style>
