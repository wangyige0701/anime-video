import type Koa from 'koa';
import { createPromise } from '@wang-yige/utils';
import { Context, Controller, Cors, HttpMethod, ResponseHeader, Singleton } from 'koa-use-decorator-router';
import { OSUtils, type MemoryInfo, type MonitorResult } from 'node-os-utils';
import { ServerRoot } from '~routes/server';
import { Response } from '~server/middlewares/response';

const UPDATE_INTERVAL_MS = 2000;
const MEMORY_CACHE_TTL_MS = 5000;
// 复用监控库实例，并让监控项缓存与全局采集周期保持一致。
const osUtils = new OSUtils({
	cacheTTL: UPDATE_INTERVAL_MS,
	cpu: { cacheTTL: UPDATE_INTERVAL_MS },
	// 内存变化相对缓慢，降低底层系统读取频率，但仍按采集周期广播最新缓存。
	memory: { cacheTTL: MEMORY_CACHE_TTL_MS },
});

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class SystemController {
	@HttpMethod.Get('/system')
	public async getSystemInfo(@Context() ctx: Koa.Context) {
		return ctx.Success(await collectSystemInfo());
	}

	@HttpMethod.Get('/system/stream')
	@ResponseHeader('Content-Type', 'text/event-stream')
	@ResponseHeader('Cache-Control', 'no-cache, no-transform')
	@ResponseHeader('Connection', 'keep-alive')
	@ResponseHeader('X-Accel-Buffering', 'no')
	public async streamSystemInfo(@Context() ctx: Koa.Context) {
		// SSE 直接写入原始响应流，因此不交给 Koa 的响应体处理。
		ctx.status = 200;
		ctx.respond = false;
		ctx.req.setTimeout(0);
		ctx.res.flushHeaders();
		ctx.log.debug({ event: 'system.stream.connected' }, 'System info stream connected');

		let closed = false;
		let unsubscribe: (() => void) | undefined;
		const { resolve: resolveStream, promise } = createPromise<void>();

		// 客户端断开或响应出错时，及时移除订阅并结束当前请求。
		const close = (reason: 'client_closed' | 'response_error' | 'write_error') => {
			if (closed) {
				return;
			}
			closed = true;
			unsubscribe?.();
			resolveStream();
			ctx.log.debug({ event: 'system.stream.closed', reason }, 'System info stream closed');
		};

		ctx.res.once('close', () => {
			close('client_closed');
		});
		ctx.res.once('error', (error) => {
			ctx.log.warn({ event: 'system.stream.response_error', err: error }, 'System info stream response error');
			close('response_error');
		});

		unsubscribe = systemInfoCollector.subscribe((event) => {
			if (closed || ctx.res.writableEnded || ctx.res.destroyed) {
				close('client_closed');
				return;
			}
			if (event.type === 'error') {
				ctx.log.warn(
					{ event: 'system.info.collection_failed', message: event.data.message },
					'System information collection failed',
				);
			}
			try {
				ctx.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
			} catch (error) {
				ctx.log.warn({ event: 'system.stream.write_failed', err: error }, 'Failed to write system info event');
				close('write_error');
			}
		});
		if (closed) {
			unsubscribe();
		}

		await promise;
	}
}

type SystemInfo = {
	cpu: {
		usagePercentage: number;
	};
	memory: {
		total: number;
		used: number;
		free: number;
		available: number;
		usagePercentage: number;
	};
};

// SSE 推送事件，成功和失败使用不同的事件类型。
type SystemInfoEvent =
	| { type: 'system'; data: ReturnType<Response<SystemInfo>['getBody']> }
	| { type: 'error'; data: { message: string } };

type SystemInfoSubscriber = (event: SystemInfoEvent) => void;

// 全局系统信息采集器：所有 SSE 连接共享一次采集结果。
class SystemInfoCollector {
	// 当前连接的广播订阅者。
	private readonly subscribers = new Set<SystemInfoSubscriber>();
	// 新连接建立时先发送最近一次结果，避免等待下一轮采集。
	private latestEvent: SystemInfoEvent | undefined;
	// 采集完成后等待下一轮的定时器。
	private timer: NodeJS.Timeout | undefined;
	// 防止采集任务尚未完成时重复启动。
	private collecting = false;

	// 添加订阅者；首个订阅者到来时启动采集循环。
	public subscribe(subscriber: SystemInfoSubscriber) {
		this.subscribers.add(subscriber);
		if (this.latestEvent) {
			this.notify(subscriber, this.latestEvent);
		}
		if (this.subscribers.size === 1) {
			void this.collectAndBroadcast();
		}

		return () => {
			this.subscribers.delete(subscriber);
			// 没有客户端监听时停止定时器，避免后台持续采集。
			if (this.subscribers.size === 0 && this.timer) {
				clearTimeout(this.timer);
				this.timer = undefined;
			}
		};
	}

	// 单次采集完成后统一广播，并在仍有订阅者时安排下一轮采集。
	private async collectAndBroadcast() {
		if (this.collecting || this.subscribers.size === 0) {
			return;
		}

		this.collecting = true;
		try {
			const data = new Response(await collectSystemInfo(), 200, true, 'OK').getBody();
			this.broadcast({ type: 'system', data });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to collect system information';
			this.broadcast({ type: 'error', data: { message } });
		} finally {
			this.collecting = false;
			if (this.subscribers.size > 0) {
				this.timer = setTimeout(() => {
					this.timer = undefined;
					void this.collectAndBroadcast();
				}, UPDATE_INTERVAL_MS);
			}
		}
	}

	// 保存最近一次事件，并发送给所有当前订阅者。
	private broadcast(event: SystemInfoEvent) {
		this.latestEvent = event;
		for (const subscriber of this.subscribers) {
			this.notify(subscriber, event);
		}
	}

	// 单个订阅者写入失败时只移除该订阅，不影响其他连接。
	private notify(subscriber: SystemInfoSubscriber, event: SystemInfoEvent) {
		try {
			subscriber(event);
		} catch {
			this.subscribers.delete(subscriber);
		}
	}
}

// 控制器实例之外只创建一个采集器，避免每个请求重复采集系统信息。
const systemInfoCollector = new SystemInfoCollector();

async function collectSystemInfo(): Promise<SystemInfo> {
	// CPU 与内存信息彼此独立，可并行采集以缩短接口响应时间。
	const [cpu, memory] = await Promise.all([osUtils.cpu.usage(), osUtils.memory.info()]);
	const cpuUsage = getMonitorData(cpu);
	const memoryInfo = getMonitorData(memory);

	return {
		cpu: {
			usagePercentage: cpuUsage,
		},
		memory: getMemoryData(memoryInfo),
	};
}

function getMemoryData(memory: MemoryInfo) {
	return {
		// 容量统一使用字节，避免传输层混用 MB、GB 等单位。
		total: memory.total.toBytes(),
		used: memory.used.toBytes(),
		free: memory.free.toBytes(),
		available: memory.available.toBytes(),
		usagePercentage: memory.usagePercentage,
	};
}

function getMonitorData<T>(result: MonitorResult<T>) {
	if (!result.success) {
		// 统一将监控库的失败结果转为接口异常处理流程。
		throw new Error(result.error.message);
	}
	return result.data;
}
