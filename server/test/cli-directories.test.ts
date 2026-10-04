import path from 'node:path';
import os from 'node:os';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDirectoryCommands, validateDirectoryArgument } from '~server/cli/directories';
// @ts-expect-error JavaScript CLI 启动器没有单独的声明文件。
import { decodePnpmScriptArgument } from '~server/cli-launcher.mjs';

const seriesMock = vi.hoisted(() => ({
	getDirectories: vi.fn(),
	setDirectories: vi.fn(),
	addDirectories: vi.fn(),
	updateSeries: vi.fn(),
}));

vi.mock('~server/data/series', () => ({ Series: seriesMock }));

describe('directory CLI argument validation', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('accepts standard Windows and UNC directory paths', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		expect(() => validateDirectoryArgument(String.raw`D:\test`)).not.toThrow();
		expect(() => validateDirectoryArgument(String.raw`\\server\share`)).not.toThrow();
	});

	it('rejects escaped backslashes in Windows directory paths', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		expect(() => validateDirectoryArgument(String.raw`D:\\test`)).toThrow('除 UNC 路径前缀外，请使用单个反斜杠');
		expect(() => validateDirectoryArgument(String.raw`\\server\\share`)).toThrow(
			'除 UNC 路径前缀外，请使用单个反斜杠',
		);
	});

	it('restores one pnpm run escaping layer before validation', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		expect(decodePnpmScriptArgument(String.raw`D:\\test`)).toBe(String.raw`D:\test`);
		expect(decodePnpmScriptArgument(String.raw`D:\\\\test`)).toBe(String.raw`D:\\test`);
	});

	it('appends normalized directories without replacing existing configuration', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-video-cli-'));
		const normalizedDirectory = await realpath(directory);
		const configuredDirectory = path.resolve('configured');
		seriesMock.getDirectories
			.mockResolvedValueOnce([configuredDirectory])
			.mockResolvedValueOnce([configuredDirectory, normalizedDirectory]);
		seriesMock.addDirectories.mockResolvedValue(undefined);
		seriesMock.updateSeries.mockResolvedValue(undefined);
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		try {
			const program = new Command();
			addDirectoryCommands(program);
			await program.parseAsync(['node', 'test', 'dir', 'add', directory]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}

		expect(seriesMock.addDirectories).toHaveBeenCalledWith(normalizedDirectory);
		expect(seriesMock.setDirectories).not.toHaveBeenCalled();
		expect(seriesMock.updateSeries).toHaveBeenCalledOnce();
	});
});
