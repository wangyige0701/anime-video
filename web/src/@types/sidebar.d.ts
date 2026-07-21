import type { Component } from 'vue';
import type { RouteMap } from 'vue-router';

export interface SidebarItem {
	label: string;
	name: keyof RouteMap;
	icon: Component;
}
