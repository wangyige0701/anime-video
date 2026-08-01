<template>
	<div class="sidebar-container">
		<template v-for="item in items" :key="item.name">
			<router-link class="sidebar-item" :to="{ name: item.name }">
				<el-icon size="1.2rem" class="icon">
					<component :is="item.icon"></component>
				</el-icon>
				<span class="label">{{ item.label }}</span>
			</router-link>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { SidebarItem } from '@/@types/sidebar';
import { Clock, HomeFilled, Setting, Star } from '@element-plus/icons-vue';

const items: Array<SidebarItem> = [
	{
		label: '首页',
		name: 'Index',
		icon: HomeFilled,
	},
	{
		label: '收藏',
		name: 'Collect',
		icon: Star,
	},
	{
		label: '历史',
		name: 'History',
		icon: Clock,
	},
	{
		label: '设置',
		name: 'Setting',
		icon: Setting,
	},
];
</script>

<style scoped lang="scss">
@use '@/scss/token.scss' as token;
@use 'sass:map';

.sidebar-container {
	width: token.$menu-width;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	position: fixed;
	top: calc((100% - token.$main-padding) / 2);
	left: token.$main-padding;
	transform: translateY(-50%);
	background-color: map.get(token.$theme, 'sidebar-bg');
	padding: 1rem 0;
	border-radius: 15px;
	color: map.get(token.$theme, 'l-9');
	box-shadow:
		0 5px 10px map.get(token.$theme, 'd-3'),
		0 0 0 1px map.get(token.$theme, 'primary');
}

.sidebar-item {
	cursor: pointer;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	gap: 4px;
	font-size: 0.875rem;
	border-radius: 10px;
	padding: 10px 1rem;
	line-height: 1;
	text-decoration: none;
	color: inherit;
	transition:
		background-color 0.3s ease,
		color 0.3s ease,
		filter 0.3s ease;
	&.router-link-active,
	&:hover {
		background-color: map.get(token.$theme, 'd-2');
	}
	&.router-link-active {
		color: token.$text-color-primary;
		.icon,
		.label {
			filter: drop-shadow(0 0 4px map.get(token.$theme, 'l-9'));
		}
	}
}
</style>
