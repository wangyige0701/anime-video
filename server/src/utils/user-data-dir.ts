import path from 'node:path';

/**
 * 当前用户的数据目录。
 *
 * 桌面端与开发模式共用这一套规则：用户设置（`settings.json`）与桌面端的全局目录白名单
 * 都放在这里，卸载重装不会丢；换机器不跟随，符合「凭据不离开本机」的约定。
 *
 * `ANIME_VIDEO_DATA_DIR` 用于隔离：测试、多套配置并存时指向其它目录即可，
 * `scripts/migrate-env.mjs` 也按同一变量决定写入位置。
 */
export function getUserDataDirectory() {
	const configuredDirectory = process.env.ANIME_VIDEO_DATA_DIR?.trim();
	if (configuredDirectory) {
		return path.resolve(configuredDirectory);
	}

	if (process.platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA ?? process.env.APPDATA;
		const userProfile = process.env.USERPROFILE ?? process.cwd();
		return path.join(localAppData ?? path.join(userProfile, 'AppData', 'Local'), 'Anime Video');
	}

	if (process.platform === 'darwin') {
		return path.join(process.env.HOME ?? process.cwd(), 'Library', 'Application Support', 'Anime Video');
	}

	const dataHome = process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? process.cwd(), '.local', 'share');
	return path.join(dataHome, 'anime-video');
}
