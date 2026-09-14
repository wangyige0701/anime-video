import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeRoot = resolve(serverRoot, '.runtime');
const instanceKey = createHash('sha256').update(serverRoot).digest('hex').slice(0, 16);

/**
 * 运行目录保存 IPC 端点等临时状态，随项目路径区分不同工作区实例。

 */
export function getRuntimeRoot() {
	return runtimeRoot;
}

export function getServerRoot() {
	return serverRoot;
}

export async function ensureRuntimeRoot() {
	await mkdir(runtimeRoot, { recursive: true });
	return runtimeRoot;
}

export function getEndpoint() {
	// Windows 使用命名管道，Unix 使用 socket 文件，避免占用业务 HTTP 端口。
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\anime-video-${instanceKey}`;
	}
	return resolve(runtimeRoot, 'manager.sock');
}

export function getManagerEntry() {
	// manager 和 worker 共享当前 TypeScript loader 及执行参数。
	return resolve(dirname(fileURLToPath(import.meta.url)), 'daemon-entry.ts');
}

export function getWorkerEntry() {
	// worker 入口根据内部服务名只加载一个目标服务模块。
	return resolve(dirname(fileURLToPath(import.meta.url)), '../worker.ts');
}
