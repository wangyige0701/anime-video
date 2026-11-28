import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CSRF_META_NAME, CSRF_TOKEN_PLACEHOLDER } from './csrf';

/**
 * CSRF 令牌的签发与校验（仅 Node 使用，浏览器不能导入）。
 *
 * 令牌随页面下发，因此**签发方与校验方是两个进程**：静态页服务（或 Vite 开发服务）
 * 在返回 `index.html` 时签发，API 在收到写请求时校验。两者必须共用一个密钥，否则
 * 签出来的令牌对方认不出来。密钥落在应用数据目录的一个文件里，谁先启动谁创建，
 * 另一个直接读取——这比「令牌接口」少一个可被跨站调用的入口，也不需要两边同时在线。
 *
 * 密钥文件放在数据目录而不是 `config.yaml`：配置是随包分发的，密钥必须每台机器唯一。
 * 文件被删除后会自动重建，代价是此前签发的令牌一起失效（页面刷新即可）。
 */

/** 密钥文件名，落在应用数据目录下 */
const SECRET_FILE = '.csrf-secret';

/** 令牌有效期：页面里的令牌无法在客户端续期，取 7 天覆盖长期挂着的标签页 */
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

/** 允许的时钟偏差：签发方与校验方在同一台机器，留一点余量避免边界抖动 */
const CLOCK_SKEW = 60 * 1000;

/**
 * 读取安装级密钥，不存在时创建一个。
 *
 * 多个进程可能同时首次创建，因此「先写临时文件再 rename」保证读到的永远是完整内容，
 * 并在 rename 之后重新读一次：并发创建时以最终落盘的那份为准，避免两边各持一份密钥。
 *
 * @param directory 应用数据目录（与 `settings.json` 同级）
 */
export function readCsrfSecret(directory: string) {
	const file = path.join(directory, SECRET_FILE);
	const existing = readSecretFile(file);
	if (existing) {
		return existing;
	}

	fs.mkdirSync(directory, { recursive: true });
	const secret = crypto.randomBytes(32).toString('hex');
	const temp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temp, secret, { mode: 0o600 });
	fs.renameSync(temp, file);
	return readSecretFile(file) ?? secret;
}

function readSecretFile(file: string) {
	try {
		const content = fs.readFileSync(file, 'utf-8').trim();
		return content || null;
	} catch {
		return null;
	}
}

function sign(secret: string, issuedAt: string, nonce: string) {
	return crypto.createHmac('sha256', secret).update(`${issuedAt}.${nonce}`).digest('base64url');
}

/** 令牌结构：`签发时间(36 进制).随机串.HMAC`，无状态，不需要服务端存储 */
export function createCsrfToken(secret: string, now = Date.now()) {
	const issuedAt = now.toString(36);
	const nonce = crypto.randomBytes(12).toString('base64url');
	return `${issuedAt}.${nonce}.${sign(secret, issuedAt, nonce)}`;
}

/**
 * 校验令牌：结构、时效、签名都要通过。
 *
 * 签名比较使用 `timingSafeEqual`，避免逐字符比较带来时序差异。
 */
export function verifyCsrfToken(secret: string, token: string | undefined, now = Date.now()) {
	if (!token) {
		return false;
	}
	const parts = token.split('.');
	if (parts.length !== 3) {
		return false;
	}
	const [issuedAt, nonce, signature] = parts as [string, string, string];
	const time = Number.parseInt(issuedAt, 36);
	if (!Number.isSafeInteger(time) || time <= 0) {
		return false;
	}
	if (now - time > TOKEN_TTL || time - now > CLOCK_SKEW) {
		return false;
	}
	const expected = Buffer.from(sign(secret, issuedAt, nonce));
	const actual = Buffer.from(signature);
	return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * 给页面注入令牌：读取（必要时创建）数据目录里的密钥并签发。
 *
 * 静态页服务与 Vite 开发服务都调这一个函数，避免「开发一套、发布一套」导致两边
 * 签出的令牌互不认账。每次调用都重新读密钥文件，密钥被删掉重建后无需重启即可自愈。
 *
 * @param html 页面 HTML；含占位符时替换，否则插到 `</head>` 之前
 * @param directory 应用数据目录（密钥文件所在目录）
 */
export function injectCsrfHtml(html: string, directory: string) {
	return injectCsrfToken(html, createCsrfToken(readCsrfSecret(directory)));
}

/**
 * 把令牌写进页面。
 *
 * 模板里已有占位符时替换它（静态页服务把整份 HTML 缓存在内存里，只有令牌按请求变化），
 * 否则插到 `</head>` 之前（Vite 开发服务每次都是新的 HTML）。
 * 替换用字符串切分而不是正则：令牌是 base64url，但换成正则后仍要为 `$` 之类的字符操心。
 */
export function injectCsrfToken(html: string, token: string) {
	if (html.includes(CSRF_TOKEN_PLACEHOLDER)) {
		return html.split(CSRF_TOKEN_PLACEHOLDER).join(token);
	}
	const meta = `<meta name="${CSRF_META_NAME}" content="${token}">`;
	return html.replace('</head>', `${meta}</head>`);
}
