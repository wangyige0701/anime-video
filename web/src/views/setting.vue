<template>
	<div class="setting">
		<h1>设置</h1>

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
import { Brush, Connection, MagicStick, VideoPlay } from '@element-plus/icons-vue';

definePage({
	name: 'Setting',
	meta: {
		title: '设置',
	},
	// 侧边栏「设置」指向父级，进入时先落在外观分组
	redirect: {
		name: 'SettingAppearance',
	},
});

/**
 * 设置分组。
 *
 * 「通用」放本机偏好（外观、播放器），「外部服务」放需要凭据的第三方接口；
 * 新增分组时往这里加一项即可，菜单按组渲染，不需要改模板。
 */
type SettingRouteName = 'SettingAppearance' | 'SettingPlayer' | 'SettingAi' | 'SettingBangumi';

interface SettingGroup {
	label: string;
	items: Array<{ label: string; name: SettingRouteName; icon: Component }>;
}

const groups: SettingGroup[] = [
	{
		label: '通用',
		items: [
			{ label: '外观', name: 'SettingAppearance', icon: Brush },
			{ label: '播放器', name: 'SettingPlayer', icon: VideoPlay },
		],
	},
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
@use '@/scss/mixin/text.scss' as text;
@use 'sass:map';

.setting {
	display: flex;
	flex-direction: column;
	gap: 18px;
	width: 100%;
	max-width: 980px;
	padding-bottom: 20px;

	h1 {
		margin: 0;

		@include text.text(1.5rem, 1.3, token.$text-color-primary);

		font-weight: 600;
	}
}

.setting-body {
	display: flex;
	align-items: flex-start;
	gap: 20px;
}

.setting-menu {
	position: sticky;
	top: 0;
	display: flex;
	flex: 0 0 164px;
	flex-direction: column;
	gap: 14px;
	padding: 10px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: token.$radius-ex-lg;
	background-color: rgba(0, 0, 0, 0.22);
}

.menu-group {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.group-label {
	padding: 4px 10px 6px;

	@include text.text(0.6875rem, 1.4, map.get(token.$theme, 'l-6'));

	letter-spacing: 0.06em;
}

.menu-item {
	position: relative;
	display: flex;
	align-items: center;
	gap: 9px;
	padding: 9px 10px;
	border-radius: token.$radius-sm;

	@include text.text(0.875rem, 1.3, map.get(token.$theme, 'l-8'));

	text-decoration: none;
	transition:
		background-color 0.18s ease,
		color 0.18s ease;

	.icon {
		@include text.text(15px, 1, map.get(token.$theme, 'l-7'));

		transition: color 0.18s ease;
	}

	&:hover {
		color: #fff;
		background-color: rgba(255, 255, 255, 0.06);

		.icon {
			color: #fff;
		}
	}

	// 子路由激活时同时带 router-link-active，不需要额外维护选中态
	&.router-link-active {
		color: #fff;
		background-color: rgba(255, 255, 255, 0.1);

		.icon {
			color: #fff;
		}

		&::before {
			content: '';
			position: absolute;
			top: 50%;
			left: 0;
			width: 2px;
			height: 16px;
			border-radius: 0 2px 2px 0;
			background-color: map.get(token.$theme, 'l-9');
			transform: translateY(-50%);
		}
	}
}

.setting-content {
	flex: 1;
	min-width: 0;
}

// 窄屏下侧边菜单横占一列会把面板挤到 400px 以内，改成一行标签
@media (max-width: 760px) {
	.setting-body {
		flex-direction: column;
	}

	.setting-menu {
		position: static;
		flex: none;
		flex-flow: row wrap;
		gap: 4px;
		width: 100%;
	}

	.menu-group {
		flex-flow: row wrap;
		align-items: center;
		gap: 4px;
	}

	.group-label {
		display: none;
	}
}
</style>
