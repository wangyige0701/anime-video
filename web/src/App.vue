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
				<el-scrollbar ref="scrollbar" view-class="main-container" @scroll="onScroll" @end-reached="endReached">
					<div class="scroll-container">
						<router-view v-slot="{ Component }">
							<keep-alive :include="[WebRoute.INDEX]">
								<component :is="Component"></component>
							</keep-alive>
						</router-view>
					</div>
				</el-scrollbar>

				<Sidebar />
				<BackToTop :visible="scrolled > BACK_TO_TOP_THRESHOLD" @click="backToTop" />
			</el-main>
		</el-container>

		<!-- 首次全量数据请求与路由分包下载共用同一层遮罩，只换提示文案 -->
		<GlobalLoading :visible="!!loadingTip" :tip="loadingTip" />
	</el-config-provider>
</template>

<script setup lang="ts">
import type { ScrollbarDirection } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { onBeforeMount, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { WebRoute } from '~shared/web-route-config';
import { useVideoStore } from './stores/video';
import { useDeviceStore } from './stores/device';
import { endReachedEmitter } from './events/end-reached';
import { useThemeStore } from './stores/theme';
import { useSystemStore } from './stores/system';
import { routeLoading } from './router/loading';
import { setScrollTarget } from './router/scroll';
import BackToTop from './components/common/BackToTop.vue';

useThemeStore().initialize();
const systemStore = useSystemStore();
const videoStore = useVideoStore();

/** 滚过这个距离才显示回到顶部按钮：顶部附近没有可回的位置，出现反而碍事 */
const BACK_TO_TOP_THRESHOLD = 400;

const scrollbarRef = useTemplateRef('scrollbar');
const scrolled = ref(0);

function onScroll({ scrollTop }: { scrollTop: number }) {
	scrolled.value = scrollTop;
}

/** 平滑回到顶部；滚动容器是 el-scrollbar 的 wrap，`window` 不参与 */
function backToTop() {
	scrollbarRef.value?.wrapRef?.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 把主滚动容器交给路由层，供返回时恢复位置。
 *
 * 直接改原生 wrap 的 `scrollTop`：同步生效并照常派发 scroll 事件，
 * el-scrollbar 的滚动条与内部状态随之更新；用实例的 `setScrollTop` 是异步的，
 * 恢复时的逐帧重试会读不到刚设进去的值而反复重试。
 */
onMounted(() => {
	const scrollbar = scrollbarRef.value;
	if (!scrollbar) {
		return;
	}
	setScrollTarget({
		get: () => scrollbar.wrapRef?.scrollTop ?? 0,
		set: (top) => {
			const wrap = scrollbar.wrapRef;
			if (wrap) {
				wrap.scrollTop = top;
			}
		},
	});
});

onBeforeUnmount(() => {
	setScrollTarget(null);
});

/**
 * 全局遮罩的提示文案。
 *
 * 首次进入时全量数据还在请求，此时优先提示数据加载；
 * 数据就绪后切换路由，才提示页面（分包脚本）加载。
 */
const loadingTip = computed(() => {
	if (videoStore.loading && !videoStore.initialized) {
		return '正在加载视频数据…';
	}
	if (routeLoading.value) {
		return '正在加载页面…';
	}
	return '';
});

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
	// 滚动条配色由 assets/elements/scrollbar.scss 统一提供，这里只补主容器的层级与内边距
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
