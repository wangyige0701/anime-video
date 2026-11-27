import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// 迁移脚本是纯 .mjs，不参与 TS 编译；测试里按结构声明它的导出
const script = (await import('../../scripts/migrate-env.mjs')) as {
	parseEnvText: (text: string) => Record<string, string>;
	envToSettingsPatch: (env: Record<string, string>) => Record<string, Record<string, string | number>>;
	mergeIntoExisting: (
		existing: unknown,
		patch: Record<string, Record<string, string | number>>,
	) => { merged: Record<string, any>; applied: string[]; skipped: string[] };
	migrate: (options: { envFile: string; dataDir: string; dryRun?: boolean }) => {
		applied: string[];
		skipped: string[];
		found: boolean;
	};
};

const { parseEnvText, envToSettingsPatch, mergeIntoExisting, migrate } = script;

describe('解析 .env 文本', () => {
	it('支持 export、注释与成对引号', () => {
		const env = parseEnvText(
			[
				'# 注释行',
				'AI_BASE_URL=https://example.com/v1 # 行尾注释',
				'export AI_MODEL="gpt-test # 引号内的井号保留"',
				"AI_API_KEY='sk-test'",
				'EMPTY=',
			].join('\n'),
		);
		expect(env.AI_BASE_URL).toBe('https://example.com/v1');
		expect(env.AI_MODEL).toBe('gpt-test # 引号内的井号保留');
		expect(env.AI_API_KEY).toBe('sk-test');
		expect(env.EMPTY).toBe('');
	});

	it('忽略无法解析的行', () => {
		expect(parseEnvText('没有等号\n1INVALID=x\nGOOD=1')).toEqual({ GOOD: '1' });
	});
});

describe('旧 .env 转设置补丁', () => {
	it('把 AI_* 与 BGM_* 映射到对应字段', () => {
		expect(
			envToSettingsPatch({
				AI_BASE_URL: 'https://api.deepseek.com/v1',
				AI_API_KEY: 'sk-1',
				AI_MODEL: 'deepseek-chat',
				AI_PROXY: 'http://127.0.0.1:7891',
				BGM_BASE_URL: 'https://api.bgm.tv',
				BGM_USER_AGENT: 'anime-video/1.0 (dev)',
				BGM_PROXY: 'http://127.0.0.1:7890',
			}),
		).toEqual({
			ai: {
				baseUrl: 'https://api.deepseek.com/v1',
				apiKey: 'sk-1',
				model: 'deepseek-chat',
				proxy: 'http://127.0.0.1:7891',
			},
			bangumi: {
				baseUrl: 'https://api.bgm.tv',
				userAgent: 'anime-video/1.0 (dev)',
				proxy: 'http://127.0.0.1:7890',
			},
		});
	});

	it('BANGUMI_ 前缀优先于 BGM_', () => {
		const patch = envToSettingsPatch({ BANGUMI_BASE_URL: 'https://new', BGM_BASE_URL: 'https://old' });
		expect(patch.bangumi!.baseUrl).toBe('https://new');
	});

	it('空值与纯空白不写入，非法超时按未填处理', () => {
		const patch = envToSettingsPatch({
			AI_API_KEY: '   ',
			BGM_PROXY: '',
			AI_TIMEOUT: 'abc',
			BANGUMI_TIMEOUT: '-5',
		});
		expect(patch).toEqual({});
	});

	it('超时转成正整数', () => {
		expect(envToSettingsPatch({ AI_TIMEOUT: ' 30000 ' })).toEqual({ ai: { timeout: 30000 } });
	});
});

describe('合并到已有设置', () => {
	it('只补空字段，已有值不被旧 .env 覆盖', () => {
		const { merged, applied, skipped } = mergeIntoExisting(
			{ ai: { baseUrl: 'https://kept', apiKey: 'sk-live' } },
			{ ai: { baseUrl: 'https://old', apiKey: 'sk-old', model: 'm' } },
		);
		expect(merged.ai.baseUrl).toBe('https://kept');
		expect(merged.ai.apiKey).toBe('sk-live');
		expect(merged.ai.model).toBe('m');
		expect(applied).toEqual(['ai.model']);
		expect(skipped).toEqual(['ai.baseUrl', 'ai.apiKey']);
	});
});

describe('迁移落盘', () => {
	let directory: string;
	let envFile: string;

	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'anime-migrate-'));
		envFile = path.join(directory, '.env');
		await fs.writeFile(envFile, 'AI_BASE_URL=https://api.test/v1\nAI_MODEL=m\n', 'utf8');
	});

	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	it('写入 settings.json 并补齐默认值', async () => {
		const dataDir = path.join(directory, 'data');
		const result = migrate({ envFile, dataDir });
		expect(result.applied).toEqual(['ai.baseUrl', 'ai.model']);

		const written = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'));
		expect(written.ai.baseUrl).toBe('https://api.test/v1');
		expect(written.bangumi.baseUrl).toBe('https://api.bgm.tv');
	});

	it('预演不落盘', async () => {
		const dataDir = path.join(directory, 'data');
		migrate({ envFile, dataDir, dryRun: true });
		await expect(fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).rejects.toThrow();
	});

	it('.env 不存在时不报错', () => {
		const result = migrate({ envFile: path.join(directory, 'missing.env'), dataDir: directory });
		expect(result.found).toBe(false);
		expect(result.applied).toEqual([]);
	});
});
