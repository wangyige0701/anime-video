import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	clearSettingsCache,
	getSettingsFile,
	readSettings,
	toSettingsView,
	updateSettings,
} from '~server/src/settings/store';

let directory: string;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), 'anime-settings-'));
	process.env.ANIME_VIDEO_DATA_DIR = directory;
	clearSettingsCache();
});

afterEach(async () => {
	clearSettingsCache();
	delete process.env.ANIME_VIDEO_DATA_DIR;
	await fs.rm(directory, { recursive: true, force: true });
});

describe('用户设置存储', () => {
	it('首次读取返回默认值', async () => {
		const settings = await readSettings();
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});

	it('文件缺失时按需创建', async () => {
		await readSettings();
		const content = JSON.parse(await fs.readFile(getSettingsFile(), 'utf8'));
		expect(content.bangumi.baseUrl).toBe('https://api.bgm.tv');
	});

	it('更新后立即落盘并可被重新读取', async () => {
		await updateSettings({ ai: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' } });

		const onDisk = JSON.parse(await fs.readFile(getSettingsFile(), 'utf8'));
		expect(onDisk.ai.baseUrl).toBe('https://api.deepseek.com/v1');
		expect(onDisk.ai.model).toBe('deepseek-chat');

		// 清掉进程内快照，确认落盘内容本身是完整的
		clearSettingsCache();
		const reloaded = await readSettings();
		expect(reloaded.ai.baseUrl).toBe('https://api.deepseek.com/v1');
	});

	it('密钥三态：缺省不改、空串清空、有值替换', async () => {
		await updateSettings({ ai: { apiKey: 'sk-first' } });
		await updateSettings({ ai: { model: 'm1' } });
		expect((await readSettings()).ai.apiKey).toBe('sk-first');

		await updateSettings({ ai: { apiKey: 'sk-second' } });
		expect((await readSettings()).ai.apiKey).toBe('sk-second');

		await updateSettings({ ai: { apiKey: '' } });
		expect((await readSettings()).ai.apiKey).toBe('');
	});

	it('对外视图不包含密钥明文', async () => {
		await updateSettings({
			ai: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-1234567890abcd', model: 'deepseek-chat' },
		});

		const view = toSettingsView(await readSettings());
		expect(JSON.stringify(view)).not.toContain('sk-1234567890abcd');
		expect(view.ai.hasApiKey).toBe(true);
		expect(view.ai.apiKeyMasked).toBe('****abcd');
		expect(view.ai).not.toHaveProperty('apiKey');
	});

	it('同步入口只在 Bangumi 与 AI 都可用时开放', async () => {
		const view = toSettingsView(await readSettings());
		expect(view.ai.configured).toBe(false);
		expect(view.bangumi.configured).toBe(true);
		expect(view.syncAvailable).toBe(false);

		const configured = toSettingsView(
			await updateSettings({ ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' } }),
		);
		expect(configured.syncAvailable).toBe(true);

		// 清空 Bangumi 地址同样会让入口关闭，而不是发一个必然失败的请求
		const noBangumi = toSettingsView(await updateSettings({ bangumi: { baseUrl: '' } }));
		expect(noBangumi.syncAvailable).toBe(false);
	});

	it('手写残缺文件不会带崩读取', async () => {
		await fs.writeFile(
			getSettingsFile(),
			JSON.stringify({ ai: { baseUrl: 'https://x/v1', timeout: 'bad' }, bangumi: null }),
			'utf8',
		);

		const settings = await readSettings();
		expect(settings.ai.baseUrl).toBe('https://x/v1');
		expect(settings.ai.timeout).toBe(DEFAULT_SETTINGS.ai.timeout);
		expect(settings.bangumi).toEqual(DEFAULT_SETTINGS.bangumi);
	});
});
