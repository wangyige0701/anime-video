export {};

const workerIndex = process.argv.indexOf('--internal-worker');
const service = workerIndex >= 0 ? process.argv[workerIndex + 1] : undefined;

if (service !== 'server' && service !== 'web') {
	throw new Error('invalid internal worker service');
}

const serviceModule = service === 'server' ? await import('./server') : await import('./web');
const instance = serviceModule.default();
await instance.start();
if (process.send) {
	process.send({ type: 'ready' });
}

let shutdownPromise: Promise<void> | null = null;

function shutdown() {
	if (shutdownPromise) {
		return shutdownPromise;
	}
	shutdownPromise = (async () => {
		try {
			await instance.stop();
			const { closeLogger } = await import('~server/middlewares/logger');
			await closeLogger();
			process.disconnect?.();
			process.exit(0);
		} catch (error) {
			process.send?.({ type: 'error', message: error instanceof Error ? error.message : String(error) });
			process.exit(1);
		}
	})();
	return shutdownPromise;
}

process.on('message', (message: unknown) => {
	if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'shutdown') {
		return;
	}
	void shutdown();
});

process.on('disconnect', () => {
	void shutdown();
});
