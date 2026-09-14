import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const moduleDirectory = dirname(modulePath);
// 入口与本模块必须保持相对目录和扩展名一致，兼容 tsx 源码运行及 tsc 编译产物。
const moduleExtension = extname(modulePath);
const serverRoot = resolve(moduleDirectory, '../..');
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
	return resolve(moduleDirectory, `daemon-entry${moduleExtension}`);
}

export function getWorkerEntry() {
	// worker 入口根据内部服务名只加载一个目标服务模块。
	return resolve(moduleDirectory, `../worker${moduleExtension}`);
}
