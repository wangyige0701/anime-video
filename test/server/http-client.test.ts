import { createServer, type AddressInfo, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Status } from '~shared/http-status';
import { requestJsonWithRetry } from '~server/src/integrations/http';

/** 起一个只监听、不响应的服务，用来制造请求超时 */
async function startHanging(): Promise<{ server: Server; url: string }> {
	const server = createServer(() => {});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return { server, url: `http://127.0.0.1:${port}` };
}

const opened: Server[] = [];

afterEach(async () => {
	await Promise.all(
		opened.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.closeAllConnections();
					server.close(() => resolve());
				}),
		),
	);
});

describe('requestJsonWithRetry', () => {
	it('正常响应返回状态码与解析后的 JSON', async () => {
		const server = createServer((_, response) => {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ ok: true }));
		});
		opened.push(server);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;

		const result = await requestJsonWithRetry<{ ok: boolean }>(`http://127.0.0.1:${port}/data`);
		expect(result.status).toBe(200);
		expect(result.data).toEqual({ ok: true });
	});

	it('超时抛 504 且消息里带主机名', async () => {
		const { server, url } = await startHanging();
		opened.push(server);
		await expect(requestJsonWithRetry(`${url}/slow`, { timeout: 150 })).rejects.toMatchObject({
			code: Status.GatewayTimeout,
			message: expect.stringContaining('请求超时'),
		});
	});

	it('连接失败抛 502，而不是让接口层回落到 500', async () => {
		// 先占一个端口再关掉，确保它不会被别的进程复用
		const probe = createServer();
		await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
		const { port } = probe.address() as AddressInfo;
		await new Promise<void>((resolve) => probe.close(() => resolve()));

		await expect(requestJsonWithRetry(`http://127.0.0.1:${port}/x`)).rejects.toMatchObject({
			code: Status.BadGateway,
			message: expect.stringContaining('无法访问'),
		});
	});

	it('5xx 会重试并在成功后返回结果', async () => {
		let attempts = 0;
		const server = createServer((_, response) => {
			attempts += 1;
			if (attempts === 1) {
				response.writeHead(503);
				response.end('busy');
				return;
			}
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ attempts }));
		});
		opened.push(server);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;

		const result = await requestJsonWithRetry<{ attempts: number }>(`http://127.0.0.1:${port}/retry`);
		expect(attempts).toBe(2);
		expect(result.data).toEqual({ attempts: 2 });
	});
});
