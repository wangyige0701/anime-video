<template>
	<div class="sidebar-container">
		<template v-for="item in items" :key="item.name">
			<div class="sidebar-item">
				<span class="sidebar-item-icon">
					<i :class="item.icon"></i>
				</span>
				<span class="sidebar-item-label">{{ item.label }}</span>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { SidebarItem } from '@/@types/sidebar';

const items: Array<SidebarItem> = [
	{
		label: '首页',
		name: 'Index',
		icon: 'icno-home',
	},
	{
		label: '收藏',
		name: 'Collect',
		icon: 'icno-like',
	},
	{
		label: '历史',
		name: 'History',
		icon: 'icno-history',
	},
	{
		label: '设置',
		name: 'Setting',
		icon: 'icno-setting',
	},
];
</script>
