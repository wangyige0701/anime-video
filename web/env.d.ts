/// <reference types="vite/client" />

import type { AppConfig } from '../shared/config.d';

declare global {
	const __APP_CONFIG__: AppConfig;
}

export {};
