<template>
	<el-config-provider>
		<el-container class="container" :class="useDeviceStore().className">
			<el-header class="header">
				<Search />
			</el-header>
			<el-main class="main">
				<router-view v-slot="{ Component }">
					<keep-alive :include="[WebRoute.INDEX]">
						<component :is="Component"></component>
					</keep-alive>
				</router-view>
			</el-main>
		</el-container>
	</el-config-provider>
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

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.container {
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: map.get(token.$theme-color, 'bg');
}

.header {
	--el-header-height: #{token.$header-height};
	display: flex;
	align-items: center;
	justify-content: center;
	position: sticky;
	top: 0;
	z-index: 100;
}

.main {
	width: 100%;
	height: 100%;
	overflow: hidden;
}
</style>
