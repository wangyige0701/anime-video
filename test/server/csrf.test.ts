import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Context } from 'koa';
import { Status } from '~shared/http-status';
import { CSRF_META_NAME, CSRF_TOKEN_PLACEHOLDER } from '~shared/csrf';
import { createCsrfToken, injectCsrfHtml, readCsrfSecret, verifyCsrfToken } from '~shared/csrf-secret';
import { csrf, isAllowedSource } from '~server/src/security/csrf';
import { ApiError } from '~server/src/error';

const secret = 'a'.repeat(64);

/** 构造只包含中间件实际用到字段的 ctx，避免为一条规则启动整个 Koa */
function createContext(options: { method?: string; headers?: Record<string, string> }) {
	const headers = new Map(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
	const written = new Map<string, string>();
	const ctx = {
		method: options.method ?? 'GET',
		get(name: string) {
			return headers.get(name.toLowerCase()) ?? '';
		},
		set(name: string, value: string) {
			written.set(name.toLowerCase(), value);
		},
		vary() {},
	};
	return { ctx, written };
}

async function run(options: { method?: string; headers?: Record<string, string> }) {
	const { ctx, written } = createContext(options);
	let reached = false;
	await csrf()(ctx, async () => {
		reached = true;
	});
	return { written, reached };
}

describe('CSRF 令牌', () => {
	it('签发后能通过校验', () => {
		expect(verifyCsrfToken(secret, createCsrfToken(secret))).toBe(true);
	});

	it('超期的令牌被拒绝', () => {
		const token = createCsrfToken(secret, Date.now() - 8 * 24 * 60 * 60 * 1000);
		expect(verifyCsrfToken(secret, token)).toBe(false);
	});

	it('改过签名的令牌被拒绝', () => {
		const token = createCsrfToken(secret);
		expect(verifyCsrfToken(secret, `${token.slice(0, -2)}xx`)).toBe(false);
		expect(verifyCsrfToken(secret, token.replace(/\./, '-'))).toBe(false);
	});

	it('换了密钥后旧令牌失效', () => {
		expect(verifyCsrfToken('b'.repeat(64), createCsrfToken(secret))).toBe(false);
	});

	it('空值、缺段与非法时间戳被拒绝', () => {
		expect(verifyCsrfToken(secret, '')).toBe(false);
		expect(verifyCsrfToken(secret, undefined)).toBe(false);
		expect(verifyCsrfToken(secret, 'abc')).toBe(false);
		expect(verifyCsrfToken(secret, 'zz.abc.def')).toBe(false);
		expect(verifyCsrfToken(secret, '.abc.def')).toBe(false);
	});
});

describe('密钥文件与页面注入', () => {
	const directory = path.join(os.tmpdir(), `anime-video-csrf-${crypto.randomUUID()}`);

	afterAll(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	it('首次读取时创建，之后保持不变', async () => {
		const first = readCsrfSecret(directory);
		expect(first).toHaveLength(64);
		expect(readCsrfSecret(directory)).toBe(first);
		// 落盘而不是只放在内存里：另一个进程（静态页服务 / 开发服务）要读到同一份
		expect((await fs.readFile(path.join(directory, '.csrf-secret'), 'utf-8')).trim()).toBe(first);
	});

	it('密钥被删除后重新生成，旧令牌随之失效', async () => {
		const first = readCsrfSecret(directory);
		await fs.rm(path.join(directory, '.csrf-secret'));
		const second = readCsrfSecret(directory);
		expect(second).not.toBe(first);
		expect(verifyCsrfToken(second, createCsrfToken(first))).toBe(false);
	});

	it('注入到占位符里，且签出的令牌能用同一份密钥校验', () => {
		const html = `<head><meta name="${CSRF_META_NAME}" content="${CSRF_TOKEN_PLACEHOLDER}"></head>`;
		const output = injectCsrfHtml(html, directory);
		const token = /content="([^"]+)"/.exec(output)?.[1] ?? '';
		expect(token).not.toBe(CSRF_TOKEN_PLACEHOLDER);
		expect(verifyCsrfToken(readCsrfSecret(directory), token)).toBe(true);
	});

	it('没有占位符时插到 </head> 之前', () => {
		const output = injectCsrfHtml('<head><title>t</title></head>', directory);
		expect(output.startsWith(`<head><title>t</title><meta name="${CSRF_META_NAME}"`)).toBe(true);
		expect(output.endsWith('></head>')).toBe(true);
	});
});

describe('isAllowedSource', () => {
	it('接受本机同端口的页面', () => {
		expect(isAllowedSource('http://localhost:5173', 'localhost:3000')).toBe(true);
		expect(isAllowedSource('http://localhost:3001', 'localhost:3000')).toBe(true);
	});

	it('回环别名互认', () => {
		expect(isAllowedSource('http://127.0.0.1:3001', 'localhost:3000')).toBe(true);
		expect(isAllowedSource('http://localhost:3001', '127.0.0.1:3000')).toBe(true);
	});

	it('同主机不同端口（自定义部署）放行', () => {
		expect(isAllowedSource('http://192.168.1.5:3001', '192.168.1.5:3000')).toBe(true);
	});

	it('拒绝其它站点', () => {
		expect(isAllowedSource('https://evil.example.com', 'localhost:3000')).toBe(false);
		// 端口对得上也不行：主机不同
		expect(isAllowedSource('http://evil.example.com:3001', 'localhost:3000')).toBe(false);
	});

	it('拒绝本机但端口不在白名单的来源', () => {
		expect(isAllowedSource('http://localhost:8080', 'localhost:3000')).toBe(false);
	});

	it('拒绝非法来源', () => {
		expect(isAllowedSource('null', 'localhost:3000')).toBe(false);
		expect(isAllowedSource('file:///index.html', 'localhost:3000')).toBe(false);
		expect(isAllowedSource('chrome-extension://abc', 'localhost:3000')).toBe(false);
	});

	it('没有来源头时放行，交给令牌校验', () => {
		expect(isAllowedSource(undefined, 'localhost:3000')).toBe(true);
		expect(isAllowedSource('', 'localhost:3000')).toBe(true);
	});
});

describe('csrf 中间件', () => {
	/** 中间件从应用数据目录读密钥，测试用环境变量把它指到临时目录 */
	const directory = path.join(os.tmpdir(), `anime-video-csrf-middleware-${crypto.randomUUID()}`);
	const original = process.env.ANIME_VIDEO_DATA_DIR;
	const origin = { origin: 'http://localhost:3001', host: 'localhost:3000' };

	beforeAll(() => {
		process.env.ANIME_VIDEO_DATA_DIR = directory;
	});

	afterAll(async () => {
		if (original) {
			process.env.ANIME_VIDEO_DATA_DIR = original;
		} else {
			delete process.env.ANIME_VIDEO_DATA_DIR;
		}
		await fs.rm(directory, { recursive: true, force: true });
	});

	function token() {
		return createCsrfToken(readCsrfSecret(directory));
	}

	it('只读请求不校验令牌', async () => {
		expect((await run({ method: 'GET', headers: origin })).reached).toBe(true);
		expect((await run({ method: 'OPTIONS', headers: origin })).reached).toBe(true);
	});

	it('写请求缺少令牌被拒绝', async () => {
		const error = await run({ method: 'POST', headers: origin }).catch((caught) => caught);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).getCode()).toBe(Status.Forbidden);
		expect((error as ApiError).message).toContain('令牌');
	});

	it('写请求带有效令牌放行', async () => {
		const { reached } = await run({ method: 'PUT', headers: { ...origin, 'x-csrf-token': token() } });
		expect(reached).toBe(true);
	});

	it('来源不合法时即使带令牌也拒绝', async () => {
		const error = await run({
			method: 'POST',
			headers: { origin: 'https://evil.example.com', host: 'localhost:3000', 'x-csrf-token': token() },
		}).catch((caught) => caught);
		expect((error as ApiError).getCode()).toBe(Status.Forbidden);
		expect((error as ApiError).message).toContain('来源');
	});

	it('无来源的非浏览器客户端也要令牌', async () => {
		const error = await run({ method: 'DELETE', headers: { host: 'localhost:3000' } }).catch((caught) => caught);
		expect((error as ApiError).getCode()).toBe(Status.Forbidden);
		// 带上令牌则放行
		expect(
			(await run({ method: 'DELETE', headers: { host: 'localhost:3000', 'x-csrf-token': token() } })).reached,
		).toBe(true);
	});
});
