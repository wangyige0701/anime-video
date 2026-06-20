<template>
	<div class="app">
		<main class="main">
			<RouterView v-slot="{ Component }">
				<KeepAlive :include="[WebRoute.INDEX]">
					<component :is="Component"></component>
				</KeepAlive>
			</RouterView>
		</main>
	</div>
</template>

<script setup lang="ts">
import { onBeforeMount } from 'vue';
import { WebRoute } from '~routes/web';
import { useVideoStore } from './stores/video';

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
