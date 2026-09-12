import { Fn } from '@wang-yige/utils';
import type { Server } from 'node:http';

export function createShutdownHandler(
	getServer: () => Server | null,
	options: { onBefore: Fn<[signal: NodeJS.Signals], any>; onAfter: Fn<[], any> },
) {
	let shuttingDown = false;
	async function shutdown(signal: NodeJS.Signals) {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;

		await options.onBefore(signal);

		const server = getServer();
		if (server) {
			await Promise.race([
				new Promise<void>((resolve) => server.close(() => resolve())),
				new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
			]);
			server.closeAllConnections();
		}

		await options.onAfter();
	}

	process.once('SIGTERM', () => void shutdown('SIGTERM'));
	process.once('SIGINT', () => void shutdown('SIGINT'));
}
