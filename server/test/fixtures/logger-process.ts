import config from '../../../shared/config-parser';

globalThis.__APP_CONFIG__ = config;
const { logger, closeLogger } = await import('../../middlewares/logger');

for (let index = 0; index < 10; index++) {
	logger.info({ component: 'http', event: 'http.request.completed', index }, 'integration log');
}

if (!process.argv.includes('--natural')) {
	const closing = closeLogger();
	if (closing !== closeLogger()) {
		throw new Error('Logger close must be idempotent');
	}
	await closing;
}
