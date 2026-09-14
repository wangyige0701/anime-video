import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import {
	managerResponseSchema,
	type ManagerAction,
	type ManagerRequest,
	type ManagerResponse,
	type ServiceName,
} from './protocol';
import { ensureRuntimeRoot, getEndpoint, getManagerEntry, getServerRoot } from './paths';

// 操作可能包含 worker 的资源关闭（日志 transport 最长 5 秒），客户端超时应明显晚于
// manager 的 worker 等待超时，避免把结构化的 manager 错误误报成连接超时。
const requestTimeoutMs = 30_000;

export async function request(action: ManagerAction, target: ServiceName | undefined, argv: readonly string[]) {
	// status 不会拉起后台 manager；变更命令在端点不可达时才按需创建它。
	if (action === 'status') {
		return connect(getEndpoint(), { action, target, argv: [...argv] });
	}

	try {
		return await connect(getEndpoint(), { action, target, argv: [...argv] });
	} catch (error) {
		if (!isConnectionError(error)) {
			throw error;
		}
		await startManager();
		return connect(getEndpoint(), { action, target, argv: [...argv] });
	}
}

async function startManager() {
	// manager 脱离 CLI 控制台运行，后续命令通过本地端点复用同一实例。
	await ensureRuntimeRoot();
	const entry = getManagerEntry();
	const child = spawn(process.execPath, [...process.execArgv, entry], {
		cwd: getServerRoot(),
		stdio: 'ignore',
		detached: true,
		windowsHide: true,
	});
	child.unref();
	await waitForEndpoint();
}

async function waitForEndpoint() {
	let lastError: unknown;
	const deadline = Date.now() + requestTimeoutMs;
	while (Date.now() < deadline) {
		try {
			await connect(getEndpoint(), { action: 'status', argv: [] });
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw new Error(`manager did not become ready: ${String(lastError)}`);
}

function connect(endpoint: string, input: Omit<ManagerRequest, 'version' | 'requestId'>) {
	// 每次请求使用独立连接和 requestId，避免多个 CLI 调用互相串线。
	return new Promise<ManagerResponse>((resolve, reject) => {
		const request: ManagerRequest = { version: 1, requestId: randomUUID(), ...input };
		const socket = net.createConnection(endpoint);
		let buffer = '';
		let settled = false;
		const timer = setTimeout(() => finish(new Error('manager request timed out')), requestTimeoutMs);

		const finish = (error?: Error, response?: ManagerResponse) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (error) {
				reject(error);
				return;
			}
			resolve(response!);
		};

		socket.setEncoding('utf8');
		socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			const newline = buffer.indexOf('\n');
			if (newline < 0) {
				return;
			}
			try {
				const response = managerResponseSchema.parse(JSON.parse(buffer.slice(0, newline)));
				finish(undefined, response);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
		socket.once('error', (error) => finish(error));
		socket.once('close', () => {
			if (!settled) {
				finish(new Error('manager connection closed before response'));
			}
		});
	});
}

function isConnectionError(error: unknown) {
	return (
		error instanceof Error &&
		['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes((error as NodeJS.ErrnoException).code ?? '')
	);
}
