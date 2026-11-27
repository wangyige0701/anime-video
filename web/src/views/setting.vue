<template>
	<div class="setting">
		<header class="page-head">
			<h1>设置</h1>
			<p class="page-hint">
				这里的配置只保存在本机用户数据目录，不会随程序分发；未配置完成时，详情页不会显示 Bangumi 同步入口。
			</p>
		</header>

		<div class="setting-body">
			<!-- 每个分组是独立子路由，刷新后仍停留在当前分组 -->
			<nav class="setting-menu">
				<div v-for="group in groups" :key="group.label" class="menu-group">
					<span class="group-label">{{ group.label }}</span>
					<router-link
						v-for="item in group.items"
						:key="item.name"
						class="menu-item"
						:to="{ name: item.name }"
					>
						<el-icon class="icon"><component :is="item.icon" /></el-icon>
						<span class="label">{{ item.label }}</span>
					</router-link>
				</div>
			</nav>

			<div class="setting-content">
				<router-view />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { Connection, MagicStick } from '@element-plus/icons-vue';

definePage({
	name: 'Setting',
	meta: {
		title: '设置',
	},
	// 侧边栏「设置」指向父级，进入时默认打开第一个分组
	redirect: {
		name: 'SettingAi',
	},
});

/**
 * 设置分组。
 *
 * AI 接口与 Bangumi 是同一块「外部服务」配置，与后续新增的通用设置（目录、外观等）区分开：
 * 新增分组时往这里加一项即可，菜单会按组渲染，不需要改模板。
 */
type SettingRouteName = 'SettingAi' | 'SettingBangumi';

interface SettingGroup {
	label: string;
	items: Array<{ label: string; name: SettingRouteName; icon: Component }>;
}

const groups: SettingGroup[] = [
	{
		label: '外部服务',
		items: [
			{ label: 'AI 接口', name: 'SettingAi', icon: MagicStick },
			{ label: 'Bangumi', name: 'SettingBangumi', icon: Connection },
		],
	},
];
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.setting {
	width: 100%;
	max-width: 960px;
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding-bottom: 20px;
}

.page-head {
	h1 {
		margin: 0;
		font-size: 1.5rem;
		color: token.$text-color-primary;
	}

	.page-hint {
		margin: 8px 0 0;
		font-size: 0.8125rem;
		line-height: 1.7;
		color: map.get(token.$theme, 'l-7');
	}
}

.setting-body {
	display: flex;
	align-items: flex-start;
	gap: 18px;
}

.setting-menu {
	flex: 0 0 156px;
	position: sticky;
	top: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 8px;
	border: 1px solid map.get(token.$theme, 'l-2');
	border-radius: token.$radius-lg;
	background-color: map.get(token.$theme, 'detail-metadata-bg');
}

.menu-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.group-label {
	padding: 2px 10px;
	font-size: 0.6875rem;
	letter-spacing: 0.04em;
	color: map.get(token.$theme, 'l-6');
}

.menu-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 9px 10px;
	border-radius: token.$radius-sm;
	font-size: 0.875rem;
	line-height: 1;
	color: map.get(token.$theme, 'l-8');
	text-decoration: none;
	transition:
		background-color 0.2s ease,
		color 0.2s ease;

	&:hover {
		background-color: rgba(255, 255, 255, 0.06);
	}

	// 子路由激活时同时带 router-link-active，不需要额外维护选中态
	&.router-link-active {
		color: token.$text-color-primary;
		background-color: rgba(255, 255, 255, 0.12);
		// 左侧主题色标记：比整块变亮更能指明当前位置
		box-shadow: inset 2px 0 0 map.get(token.$theme, 'l-9');
	}
}

.setting-content {
	flex: 1;
	min-width: 0;
}
</style>
