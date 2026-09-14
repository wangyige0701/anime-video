import { randomUUID } from 'node:crypto';
import { chmod, unlink } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { getEndpoint, getWorkerEntry, ensureRuntimeRoot, getServerRoot } from './paths';
import {
	managerRequestSchema,
	serviceNames,
	serviceStateSchema,
	type ManagerRequest,
	type ManagerResponse,
	type ServiceName,
	type ServiceState,
	workerMessageSchema,
} from './protocol';

type ServiceRecord = {
	// 每个服务只保留一个 child 句柄，状态由该句柄的生命周期驱动。
	service: ServiceName;
	state: ServiceState;
	child: ChildProcess | null;
	pid: number | null;
	instanceId: string | null;
	startedAt: string | null;
	restartCount: number;
	lastExit: { code: number | null; signal: string | null } | null;
	lastError: string | null;
	stopRequested: boolean;
	ready: Promise<void> | null;
	configArgs: string[] | null;
};

const startupTimeoutMs = 15_000;
// manager 内部只串行执行变更操作，避免并发 start/restart 争用端口。
const records = new Map<ServiceName, ServiceRecord>(serviceNames.map((service) => [service, createRecord(service)]));
let server: net.Server | null = null;
let operationQueue = Promise.resolve();
const managerId = randomUUID();
const managerIdleTimeoutMs = 30_000;
let idleTimer: NodeJS.Timeout | null = null;

export async function runManager() {
	// 端点绑定成功后 manager 才对 CLI 宣布可用；Unix 端点随后收紧为当前用户可读写。
	await ensureRuntimeRoot();
	const endpoint = getEndpoint();
	server = createManagerServer();
	try {
		await listen(server, endpoint);
	} catch (error) {
		if (process.platform !== 'win32' && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
			if (await isEndpointActive(endpoint)) {
				throw error;
			}
			await unlink(endpoint).catch(() => void 0);
			server = createManagerServer();
			await listen(server, endpoint);
		} else {
			throw error;
		}
	}
	if (process.platform !== 'win32') {
		await chmod(endpoint, 0o600).catch(() => void 0);
	}
	process.once('SIGINT', () => void shutdownManager());
	process.once('SIGTERM', () => void shutdownManager());
}

function createManagerServer() {
	return net.createServer((socket) => handleConnection(socket));
}

function listen(managerServer: net.Server, endpoint: string) {
	return new Promise<void>((resolve, reject) => {
		managerServer.once('error', reject);
		managerServer.listen(endpoint, () => resolve());
	});
}

function isEndpointActive(endpoint: string) {
	return new Promise<boolean>((resolve) => {
		const socket = net.createConnection(endpoint);
		const finish = (active: boolean) => {
			socket.destroy();
			resolve(active);
		};
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
	});
}

async function handleConnection(socket: net.Socket) {
	// 一条连接只处理一条请求，响应完成后立即关闭，避免协议状态跨请求复用。
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	let buffer = '';
	let handled = false;
	socket.setEncoding('utf8');
	socket.on('data', (chunk: string) => {
		if (handled) {
			return;
		}
		buffer += chunk;
		if (buffer.length > 64 * 1024) {
			handled = true;
			socket.destroy(new Error('manager request exceeds 64 KiB'));
			return;
		}
		if (!buffer.includes('\n')) {
			return;
		}
		handled = true;
		const line = buffer.slice(0, buffer.indexOf('\n'));
		void enqueue(line)
			.then((response) => socket.end(`${JSON.stringify(response)}\n`))
			.catch((error) =>
				socket.end(
					`${JSON.stringify({ version: 1, managerId, requestId: '', ok: false, message: String(error) })}\n`,
				),
			);
	});
}

function enqueue(line: string) {
	// status 是只读查询，可以绕过变更队列读取实时过渡状态。
	try {
		const request = JSON.parse(line) as { action?: unknown };
		if (request.action === 'status') {
			return execute(line);
		}
	} catch {
		// 让 execute() 统一生成协议错误响应。
	}
	const result = operationQueue.then(() => execute(line));
	operationQueue = result.then(
		() => void 0,
		() => void 0,
	);
	return result;
}

async function execute(line: string): Promise<ManagerResponse> {
	let request: ManagerRequest;
	try {
		request = managerRequestSchema.parse(JSON.parse(line));
	} catch (error) {
		return {
			version: 1,
			managerId,
			requestId: '',
			ok: false,
			message: `invalid manager request: ${String(error)}`,
		};
	}
	try {
		const targets = request.target ? [request.target] : [...serviceNames];
		if (request.action === 'status') {
			return {
				version: 1,
				managerId,
				requestId: request.requestId,
				ok: true,
				services: targets.map((name) => toStatus(records.get(name)!)),
			};
		}
		const startedByRequest: ServiceRecord[] = [];
		try {
			for (const name of targets) {
				const record = records.get(name)!;
				const wasRunning = record.child !== null;
				if (request.action === 'start') {
					await startService(record, request.argv);
					if (!wasRunning) {
						startedByRequest.push(record);
					}
				} else if (request.action === 'stop') {
					await stopService(record);
				} else {
					await restartService(record, request.argv);
				}
			}
		} catch (error) {
			if (request.action === 'start') {
				await Promise.allSettled(startedByRequest.map((record) => stopService(record)));
			}
			throw error;
		}
		return {
			version: 1,
			managerId,
			requestId: request.requestId,
			ok: true,
			services: targets.map((name) => toStatus(records.get(name)!)),
		};
	} catch (error) {
		return {
			version: 1,
			managerId,
			requestId: request.requestId,
			ok: false,
			message: error instanceof Error ? error.message : String(error),
			services: [...serviceNames].map((name) => toStatus(records.get(name)!)),
		};
	}
}

async function startService(record: ServiceRecord, argv: readonly string[]) {
	// 配置参数先规范化后比较，防止同一配置因大小写或传参形式不同被重复启动。
	const configArgs = normalizeConfigArgs(argv);
	if (record.state === 'running' || record.state === 'starting') {
		if (record.configArgs && JSON.stringify(record.configArgs) !== JSON.stringify(configArgs)) {
			throw new Error(`${record.service} is already running with different configuration; use restart`);
		}
		if (record.ready) {
			await record.ready;
		}
		return;
	}
	if (record.child) {
		await waitForExit(record.child, 2_000).catch(() => record.child?.kill());
		record.child = null;
		record.pid = null;
	}
	record.stopRequested = false;
	record.state = 'starting';
	record.lastError = null;
	record.instanceId = randomUUID();
	record.configArgs = configArgs;
	const child = spawn(
		process.execPath,
		[...process.execArgv, getWorkerEntry(), '--internal-worker', record.service, ...argv],
		{
			// worker 通过 IPC 报告 ready/error，标准输出不绑定 CLI 终端。
			cwd: getServerRoot(),
			stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
			windowsHide: true,
		},
	);
	record.child = child;
	record.pid = child.pid ?? null;
	record.ready = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			record.lastError = 'worker startup timed out';
			record.state = 'failed';
			record.stopRequested = true;
			child.kill();
			reject(new Error(record.lastError));
		}, startupTimeoutMs);
		child.on('message', (value) => {
			const message = workerMessageSchema.safeParse(value);
			if (!message.success) {
				return;
			}
			if (message.data.type === 'ready') {
				clearTimeout(timer);
				record.state = 'running';
				record.startedAt = new Date().toISOString();
				resolve();
			} else if (message.data.type === 'error') {
				record.lastError = message.data.message;
			}
		});
		child.once('error', (error) => {
			clearTimeout(timer);
			record.lastError = error.message;
			record.state = 'failed';
			reject(error);
		});
		child.once('exit', (code, signal) => {
			if (record.state === 'starting') {
				clearTimeout(timer);
				record.lastError ??= `worker exited before ready (${code ?? signal ?? 'unknown'})`;
				record.state = 'failed';
				reject(new Error(record.lastError));
			}
			if (record.child !== child) {
				return;
			}
			record.child = null;
			record.pid = null;
			record.lastExit = { code, signal };
			if (record.stopRequested) {
				record.state = 'stopped';
			} else {
				record.state = 'failed';
				record.lastError ??= `worker exited (${code ?? signal ?? 'unknown'})`;
			}
		});
	});
	await record.ready;
}

function normalizeConfigArgs(argv: readonly string[]) {
	const result: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (argument === 'start' || argument === 'stop' || argument === 'restart' || argument === 'status') {
			continue;
		}
		if (argument === 'server' || argument === 'web') {
			continue;
		}
		if (argument.startsWith('--')) {
			const equalIndex = argument.indexOf('=');
			const key = (equalIndex < 0 ? argument : argument.slice(0, equalIndex)).replace(/_/g, '-').toLowerCase();
			if (equalIndex >= 0) {
				result.push(`${key}${argument.slice(equalIndex)}`);
			} else if (argv[index + 1] && !argv[index + 1]!.startsWith('-')) {
				result.push(`${key}=${argv[index + 1]}`);
				index += 1;
			} else {
				result.push(key);
			}
		}
	}
	return result.sort();
}

async function stopService(record: ServiceRecord) {
	// 优雅停止始终先走 IPC；只有超过等待期限才强制结束自己创建的 child。
	if (!record.child) {
		record.state = 'stopped';
		scheduleIdleShutdown();
		return;
	}
	record.stopRequested = true;
	record.state = 'stopping';
	const child = record.child;
	if (child.connected) {
		child.send({ type: 'shutdown' }, (error) => {
			if (error) {
				record.lastError = `failed to send shutdown: ${error.message}`;
			}
		});
	}
	await waitForExit(child, 15_000);
	record.state = 'stopped';
	scheduleIdleShutdown();
}

async function restartService(record: ServiceRecord, argv: readonly string[]) {
	record.restartCount += 1;
	await stopService(record);
	await startService(record, argv);
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
	// 监听 exit 而不是轮询 PID，兼容 Windows 和 Unix 的进程退出语义。
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve();
	}
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('worker shutdown timed out'));
		}, timeoutMs);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

async function shutdownManager() {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	for (const record of records.values()) {
		await stopService(record).catch(() => void 0);
	}
	server?.close();
	if (process.platform !== 'win32') {
		await unlink(getEndpoint()).catch(() => void 0);
	}
	process.exit(0);
}

function scheduleIdleShutdown() {
	// 服务全部停止后短暂保留 manager，复用后续 CLI 请求并避免频繁创建进程。
	if ([...records.values()].some((record) => record.child !== null) || idleTimer) {
		return;
	}
	idleTimer = setTimeout(() => {
		idleTimer = null;
		void shutdownManager();
	}, managerIdleTimeoutMs);
}

function createRecord(service: ServiceName): ServiceRecord {
	return {
		service,
		state: 'stopped',
		child: null,
		pid: null,
		instanceId: null,
		startedAt: null,
		restartCount: 0,
		lastExit: null,
		lastError: null,
		stopRequested: false,
		ready: null,
		configArgs: null,
	};
}

function toStatus(record: ServiceRecord) {
	const startedAt = record.startedAt ? Date.parse(record.startedAt) : null;
	return {
		service: record.service,
		instanceId: record.instanceId,
		state: serviceStateSchema.parse(record.state),
		pid: record.pid,
		startedAt: record.startedAt,
		uptimeMs: startedAt && record.state === 'running' ? Math.max(0, Date.now() - startedAt) : 0,
		restartCount: record.restartCount,
		lastExit: record.lastExit,
		lastError: record.lastError,
	};
}
