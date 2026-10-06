const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');

const originalUserInfo = os.userInfo.bind(os);

try {
	originalUserInfo();
} catch (error) {
	const isWindowsMemoryError =
		process.platform === 'win32' &&
		(error?.code === 'ENOMEM' || error?.info?.code === 'ENOMEM') &&
		error?.syscall === 'uv_os_get_passwd';
	if (!isWindowsMemoryError) {
		throw error;
	}

	os.userInfo = (options) => {
		const encoding = typeof options === 'string' ? options : options?.encoding;
		if (encoding && encoding !== 'utf8' && encoding !== 'buffer') {
			throw new TypeError(`The argument 'encoding' is invalid. Received '${encoding}'`);
		}

		const username = process.env.USERNAME || process.env.USER || 'unknown';
		const homedir =
			process.env.USERPROFILE || `${process.env.HOMEDRIVE || ''}${process.env.HOMEPATH || ''}` || process.cwd();
		if (encoding === 'buffer') {
			return {
				uid: -1,
				gid: -1,
				username: Buffer.from(username),
				homedir: Buffer.from(homedir),
				shell: null,
			};
		}
		return { uid: -1, gid: -1, username, homedir, shell: null };
	};
	syncBuiltinESMExports();
}
