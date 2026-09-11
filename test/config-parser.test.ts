import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;
const originalEnv = { ...process.env };

afterEach(() => {
	process.argv = originalArgv;
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, originalEnv);
});

describe('configuration overrides', () => {
	it('loads values from config.yaml when no overrides are provided', async () => {
		const config = await loadConfig();

		expect(config.server.protocol).toBe('http');
		expect(config.server.port).toBe(3000);
		expect(config.logging.fileEnabled).toBe(true);
		expect(config.logging.components).toEqual(['app', 'http', 'web', 'hls']);
		expect(config.logging.httpEventSource).toEqual({
			'http.request.completed': 'access',
			'http.request.failed': 'error',
			'http.request.rejected': 'error',
		});
		expect(config.hls.imageOutputWidth).toBe(320);
	});

	it('injects environment variables and parses their values', async () => {
		const config = await loadConfig([], {
			SERVER_PORT: '4100',
			LOGGING_FILE_ENABLED: 'false',
			LOGGING_COMPONENTS: 'app,web',
			HLS_IMAGE_OUTPUT_WIDTH: '640',
		});

		expect(config.server.port).toBe(4100);
		expect(config.logging.fileEnabled).toBe(false);
		expect(config.logging.components).toEqual(['app', 'web']);
		expect(config.hls.imageOutputWidth).toBe(640);
	});

	it('applies overrides in command line, environment, and YAML order', async () => {
		const yamlConfig = await loadConfig();
		const envConfig = await loadConfig([], { SERVER_PORT: '4100' });
		const commandLineConfig = await loadConfig(['--server-port=4200'], { SERVER_PORT: '4100' });

		expect(yamlConfig.server.port).toBe(3000);
		expect(envConfig.server.port).toBe(4100);
		expect(commandLineConfig.server.port).toBe(4200);
	});

	it('uses kebab-case names from config.yaml and normalizes uppercase names', async () => {
		const config = await loadConfig([
			'--SERVER-DATA-FILE-SAVE-DELAY',
			'125',
			'--logging-file-enabled=false',
			'--HLS-IMAGE-OUTPUT-WIDTH=640',
		]);

		expect(config.server.dataFileSaveDelay).toBe(125);
		expect(config.logging.fileEnabled).toBe(false);
		expect(config.hls.imageOutputWidth).toBe(640);
	});

	it('continues to accept the previous underscore command line spelling', async () => {
		const config = await loadConfig(['--SERVER_PORT=4300']);

		expect(config.server.port).toBe(4300);
	});
});

async function loadConfig(args: string[] = [], environment: Record<string, string> = {}) {
	process.argv = ['node', 'config-parser-test', ...args];
	for (const key of Object.keys(process.env)) {
		if (/^(SERVER|LOGGING|WEB|HLS)_/.test(key)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, environment);
	vi.resetModules();
	const module = await import('../shared/config-parser');
	return module.default;
}
