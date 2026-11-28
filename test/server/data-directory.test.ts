import { isUndefined } from '@wang-yige/utils';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getServerRoot } from '~server/cli/manager/paths';
import { getSettingsFile } from '~server/src/settings/store';
import { getDataDirectory, getUserDataDirectory } from '~server/src/utils/user-data-dir';

/**
 * 应用数据目录的规则。
 *
 * 用户设置与目录白名单必须落在同一个目录：开发态覆盖正式凭据的问题就是从两套规则来的。
 * 三条分支按优先级：`ANIME_VIDEO_DATA_DIR` > `ANIME_VIDEO_DESKTOP=1` > 服务目录。
 */
const ENV_KEYS = ['ANIME_VIDEO_DATA_DIR', 'ANIME_VIDEO_DESKTOP', 'LOCALAPPDATA', 'HOME', 'XDG_DATA_HOME'] as const;

function snapshotEnv() {
	return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
	for (const key of ENV_KEYS) {
		const value = snapshot[key];
		if (isUndefined(value)) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

const original = snapshotEnv();

afterEach(() => {
	restoreEnv(original);
});

describe('应用数据目录', () => {
	it('ANIME_VIDEO_DATA_DIR 优先级最高，测试与多套配置靠它隔离', () => {
		process.env.ANIME_VIDEO_DATA_DIR = path.join(getServerRoot(), '.runtime', 'isolated');
		process.env.ANIME_VIDEO_DESKTOP = '1';

		expect(getDataDirectory()).toBe(path.resolve(process.env.ANIME_VIDEO_DATA_DIR));
		expect(getSettingsFile()).toBe(path.join(path.resolve(process.env.ANIME_VIDEO_DATA_DIR), 'settings.json'));
	});

	it('桌面端把设置和目录白名单都放在系统用户目录', () => {
		delete process.env.ANIME_VIDEO_DATA_DIR;
		process.env.ANIME_VIDEO_DESKTOP = '1';

		expect(getDataDirectory()).toBe(getUserDataDirectory());
		expect(path.dirname(getSettingsFile())).toBe(getUserDataDirectory());
	});

	it('直接运行 server 项目时落在服务目录，不会覆盖已安装应用的凭据', () => {
		delete process.env.ANIME_VIDEO_DATA_DIR;
		delete process.env.ANIME_VIDEO_DESKTOP;

		expect(getDataDirectory()).toBe(getServerRoot());
		// 与目录白名单同一个目录：`<prefix>.video.json` 也在服务目录下
		expect(path.dirname(getSettingsFile())).toBe(getServerRoot());
		expect(getDataDirectory()).not.toBe(getUserDataDirectory());
	});
});
