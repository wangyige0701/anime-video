import type { Response } from '~types/response';
import { SERVER_URL, ServerRoot } from '~routes/server';

export interface SystemInfo {
	cpu: {
		usagePercentage: number;
	};
	memory: {
		total: number;
		used: number;
		free: number;
		available: number;
		usagePercentage: number;
	};
}

export type SystemInfoCallback = (systemInfo: SystemInfo) => void;

export function subscribeSystemInfo(callback: SystemInfoCallback) {
	const eventSource = new EventSource(`${SERVER_URL}${ServerRoot.DATA}/system/stream`);

	eventSource.addEventListener('system', (event) => {
		const response = JSON.parse((event as MessageEvent<string>).data) as Response<SystemInfo>;
		if (response.success) {
			callback(response.data);
		}
	});

	return () => eventSource.close();
}
