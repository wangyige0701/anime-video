import { z } from 'zod';

// manager 只通过本地 IPC 接收这两个服务的控制命令。
export const serviceNames = ['server', 'web'] as const;
export type ServiceName = (typeof serviceNames)[number];
export type ManagerAction = 'start' | 'stop' | 'restart' | 'status';

// 请求和响应带版本号，便于后续协议扩展时拒绝不兼容的消息。
export const managerRequestSchema = z.object({
	version: z.literal(1),
	requestId: z.string().min(1),
	action: z.enum(['start', 'stop', 'restart', 'status']),
	target: z.enum(serviceNames).optional(),
	argv: z.array(z.string()).default([]),
});

export type ManagerRequest = z.infer<typeof managerRequestSchema>;

export const serviceStateSchema = z.enum(['stopped', 'starting', 'running', 'stopping', 'backoff', 'failed']);
export type ServiceState = z.infer<typeof serviceStateSchema>;

export const serviceStatusSchema = z.object({
	service: z.enum(serviceNames),
	instanceId: z.string().nullable().optional(),
	state: serviceStateSchema,
	pid: z.number().int().positive().nullable(),
	startedAt: z.string().nullable(),
	uptimeMs: z.number().nonnegative(),
	restartCount: z.number().int().nonnegative(),
	lastExit: z.object({ code: z.number().int().nullable(), signal: z.string().nullable() }).nullable(),
	lastError: z.string().nullable(),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const managerResponseSchema = z.object({
	version: z.literal(1),
	managerId: z.string().optional(),
	requestId: z.string(),
	ok: z.boolean(),
	message: z.string().optional(),
	services: z.array(serviceStatusSchema).optional(),
});

export type ManagerResponse = z.infer<typeof managerResponseSchema>;

// worker 启动完成或关闭失败时向 manager 发送的最小消息集合。
export const workerMessageSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('ready') }),
	z.object({ type: z.literal('stopped') }),
	z.object({ type: z.literal('error'), message: z.string() }),
]);

export type WorkerMessage = z.infer<typeof workerMessageSchema>;

/**
 * 行协议要求每条消息以换行结束，便于 socket 分片接收时确定边界。

 */
export function encodeMessage(value: unknown) {
	return `${JSON.stringify(value)}\n`;
}

export function parseMessage(line: string) {
	return JSON.parse(line) as unknown;
}
