<template>
	<el-config-provider :locale="zhCn">
		<el-container class="container" :class="useDeviceStore().className">
			<el-header class="header">
				<div class="header-left">
					<GlobalActions />
				</div>
				<Search />
				<div class="header-right">
					<SystemInfo />
				</div>
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

		<!-- 首次全量数据请求期间盖住空列表，避免先看到空白再突然填充 -->
		<Transition name="global-loading">
			<div v-if="initializing" class="global-loading" role="status" aria-live="polite">
				<el-icon class="spinner is-loading" :size="28"><Loading /></el-icon>
				<span class="tip">正在加载视频数据…</span>
			</div>
		</Transition>
	</el-config-provider>
</template>

<script setup lang="ts">
import type { ScrollbarDirection } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { Loading } from '@element-plus/icons-vue';
import { onBeforeMount, onBeforeUnmount } from 'vue';
import { WebRoute } from '~shared/web-route-config';
import { useVideoStore } from './stores/video';
import { useDeviceStore } from './stores/device';
import { endReachedEmitter } from './events/end-reached';
import { useThemeStore } from './stores/theme';
import { useSystemStore } from './stores/system';

useThemeStore().initialize();
const systemStore = useSystemStore();
const videoStore = useVideoStore();

/** 首次加载：请求中且尚未完成初始化时显示遮罩 */
const initializing = computed(() => videoStore.loading && !videoStore.initialized);

function endReached(direction: ScrollbarDirection) {
	endReachedEmitter.emit('endReached', { direction });
}

onBeforeMount(async () => {
	systemStore.start();
	await videoStore.initialize();
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
	.header-right {
		display: flex;
		align-items: center;
		justify-content: flex-end;
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
.global-loading {
	position: fixed;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	background-color: map.get(token.$theme, 'loading-bg');
	backdrop-filter: blur(4px);
	z-index: 2000;
	.tip {
		font-size: 0.875rem;
		color: map.get(token.$theme, 'l-9');
	}
	.spinner {
		color: map.get(token.$theme, 'l-9');
	}
}

.global-loading-enter-active,
.global-loading-leave-active {
	transition: opacity 0.25s ease;
}

.global-loading-enter-from,
.global-loading-leave-to {
	opacity: 0;
}
</style>
