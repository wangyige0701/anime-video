/// <reference types="vite/client" />

import type { AppConfig } from '../shared/config.d';
import 'vue-router';

declare global {
	const __APP_CONFIG__: AppConfig;
}

declare module 'vue-router' {
	interface RouteMeta {
		title?: string;
		setTitle?: (title: string) => void;
	}
}

export {};
