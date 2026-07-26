<template>
	<div class="sidebar-container">
		<template v-for="item in items" :key="item.name">
			<div
				class="sidebar-item"
				:class="{ active: active === item.name }"
				@click.stop="$router.push({ name: item.name })"
			>
				<el-icon size="1.2rem" class="icon">
					<component :is="item.icon"></component>
				</el-icon>
				<span class="label">{{ item.label }}</span>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { RouteLocationNormalized } from 'vue-router';
import type { SidebarItem } from '@/@types/sidebar';
import { Clock, HomeFilled, Setting, Star } from '@element-plus/icons-vue';
import router from '@/router';

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
const active = ref('');

function updateRoute(route: RouteLocationNormalized) {
	const keys = items.map((item) => item.name);
	if (keys.includes(route.name)) {
		active.value = route.name;
		return;
	}
	for (const matcher of route.matched) {
		if (keys.includes(matcher.name as RouteLocationNormalized['name'])) {
			active.value = matcher.name as RouteLocationNormalized['name'];
			return;
		}
	}
}

router.beforeEach((to, from) => {
	updateRoute(to);
});
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
	background-color: map.get(token.$theme-color, 'sidebar-bg');
	padding: 1rem 0;
	border-radius: 15px;
	color: map.get(token.$theme-color, 'l-9');
	box-shadow:
		0 5px 10px map.get(token.$theme-color, 'd-3'),
		0 0 0 1px map.get(token.$theme-color, 'primary');
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
	transition:
		background-color 0.3s ease,
		color 0.3s ease,
		filter 0.3s ease;
	&.active,
	&:hover {
		background-color: map.get(token.$theme-color, 'd-2');
	}
	&.active {
		color: token.$text-color-primary;
		.icon,
		.label {
			filter: drop-shadow(0 0 4px map.get(token.$theme-color, 'l-9'));
		}
	}
}
</style>
