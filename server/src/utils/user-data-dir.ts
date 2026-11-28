import path from 'node:path';
import { getServerRoot } from '~server/cli/manager/paths';

/**
 * 当前用户的数据目录。
 *
 * 只在桌面 EXE 与显式隔离时使用；开发态走 `getDataDirectory()` 的服务目录分支。
 * 卸载重装不会丢，换机器不跟随，符合「凭据不离开本机」的约定。
 *
 * `ANIME_VIDEO_DATA_DIR` 用于隔离：测试、多套配置并存时指向其它目录即可，
 * `scripts/migrate-env.ts` 也按同一套规则决定写入位置。
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

/**
 * 应用数据目录：用户设置（`settings.json`）与全局目录白名单（`<prefix>.video.json`）都放这里。
 *
 * 两条链路必须同规则，否则开发时改一次 AI 配置就会把已安装应用的凭据顶掉。
 *
 * - 桌面 EXE（`ANIME_VIDEO_DESKTOP=1`）：系统用户目录，卸载重装不丢配置。
 * - 直接运行 server 项目：服务目录，开发态与正式环境互不干扰。
 * - `ANIME_VIDEO_DATA_DIR`：两种模式都优先，用于测试、多套配置隔离与迁移脚本。
 */
export function getDataDirectory() {
	const isolated = Boolean(process.env.ANIME_VIDEO_DATA_DIR?.trim());
	if (isolated || process.env.ANIME_VIDEO_DESKTOP === '1') {
		return getUserDataDirectory();
	}
	return getServerRoot();
}
