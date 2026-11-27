import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnvFile, resolveEnvFile } from '~server/src/integrations/env';

/**
 * `.env` 的定位规则。
 *
 * 这些用例只用临时目录，不读仓库里真实的 `.env`：默认路径一旦依赖真实文件，
 * 结果就会跟着开发机的配置变化（本地有密钥、CI 没有）。
 */
describe('resolveEnvFile', () => {
	let root = '';

	beforeAll(async () => {
		root = await mkdtemp(path.join(tmpdir(), 'anime-env-'));
		// 模拟仓库结构：root/.env + root/server/src/integrations
		await mkdir(path.join(root, 'server', 'src', 'integrations'), { recursive: true });
		await writeFile(path.join(root, '.env'), 'AI_MODEL=test-model\n', 'utf8');
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('工作目录是子目录时，从模块位置上溯找到仓库根的 .env', () => {
		const cwd = path.join(root, 'server');
		const moduleDir = path.join(root, 'server', 'src', 'integrations');
		expect(resolveEnvFile(cwd, moduleDir)).toBe(path.join(root, '.env'));
	});

	it('工作目录根就是仓库根时直接用 cwd 下的 .env', () => {
		expect(resolveEnvFile(root, path.join(root, 'server', 'src', 'integrations'))).toBe(path.join(root, '.env'));
	});

	it('两处都没有文件时退回 cwd 下的路径，读取结果为空对象', async () => {
		const empty = await mkdtemp(path.join(tmpdir(), 'anime-env-empty-'));
		try {
			const file = resolveEnvFile(empty, path.join(empty, 'server'));
			expect(file).toBe(path.join(empty, '.env'));
			expect(await readEnvFile(file)).toEqual({});
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	it('从解析出的文件读到配置内容', () => {
		const file = resolveEnvFile(path.join(root, 'server'), path.join(root, 'server', 'src', 'integrations'));
		expect(readEnvFile(file)).toEqual({ AI_MODEL: 'test-model' });
	});
});
