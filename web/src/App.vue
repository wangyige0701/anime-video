<template>
	<el-config-provider>
		<el-container class="container" :class="useDeviceStore().className">
			<el-header class="header">
				<div class="header-left"></div>
				<Search />
				<div class="header-right"></div>
			</el-header>
			<el-main class="main">
				<el-scrollbar view-class="main-container" @end-reached="endReached">
					<div class="scroll-container">
						<router-view v-slot="{ Component }">
							<keep-alive :include="[WebRoute.INDEX]">
								<component :is="Component"></component>
							</keep-alive>
						</router-view>
					</div>
				</el-scrollbar>

				<Sidebar />
			</el-main>
		</el-container>
	</el-config-provider>
</template>

<script setup lang="ts">
import type { ScrollbarDirection } from 'element-plus';
import { onBeforeMount, onBeforeUnmount } from 'vue';
import { WebRoute } from '~routes/web';
import { useVideoStore } from './stores/video';
import { useDeviceStore } from './stores/device';
import { endReachedEmitter } from './events/end-reached';
import { useThemeStore } from './stores/theme';
import { useSystemStore } from './stores/system';

useThemeStore().initialize();
const systemStore = useSystemStore();

function endReached(direction: ScrollbarDirection) {
	endReachedEmitter.emit('endReached', { direction });
}

onBeforeMount(async () => {
	systemStore.start();
	await useVideoStore().initialize();
});

onBeforeUnmount(() => {
	systemStore.stop();
});
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.container {
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: map.get(token.$theme, 'bg');
}

.header {
	--el-header-height: #{token.$header-height};
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	position: fixed;
	top: 0;
	left: 0;
	background: map.get(token.$theme, 'header-bg');
	backdrop-filter: blur(5px);
	z-index: 100;
	.header-left,
	.header-right {
		height: 100%;
		flex: 1;
		overflow: hidden;
	}
}

.main {
	width: 100%;
	height: 100%;
	overflow: hidden;
	padding-top: 0;
	padding-left: calc(token.$menu-width + token.$main-padding);
	padding-right: 0;
	padding-bottom: 0;
	.el-scrollbar {
		--el-scrollbar-bg-color: #{map.get(token.$theme, 'l-9')};
		--el-scrollbar-hover-bg-color: #{map.get(token.$theme, 'l-6')};
	}
	:deep(.el-scrollbar__wrap) {
		padding-left: token.$main-padding;
	}
	:deep(.el-scrollbar__bar) {
		z-index: 999;
	}
	:deep(.main-container) {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		padding-right: token.$main-padding;
		padding-bottom: token.$main-padding;
	}
}

.scroll-container {
	width: 100%;
	display: flex;
	flex-direction: column;
	flex: auto;
	padding-top: calc(token.$main-padding + token.$header-height);
}
</style>
