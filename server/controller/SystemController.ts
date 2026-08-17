import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, ResponseHeader, Singleton } from 'koa-use-decorator-router';
import { OSUtils, type MemoryInfo, type MonitorResult } from 'node-os-utils';
import { ServerRoot } from '~routes/server';
import { Response } from '~server/middlewares/response';

const UPDATE_INTERVAL_MS = 2000;
// 监控库实例复用，避免每次请求重复初始化平台适配器。
const osUtils = new OSUtils({ cacheTTL: UPDATE_INTERVAL_MS });

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
		// SSE 直接写入原始响应流，因此不交给 Koa 在请求结束时自动处理响应。
		ctx.status = 200;
		ctx.respond = false;
		ctx.req.setTimeout(0);
		ctx.res.flushHeaders();

		let closed = false;
		let timer: NodeJS.Timeout | undefined;

		const close = () => {
			if (closed) {
				return;
			}
			closed = true;
			if (timer) {
				clearTimeout(timer);
			}
		};

		const send = async () => {
			if (closed || ctx.res.writableEnded) {
				return;
			}
			try {
				// SSE 中复用普通接口的响应外层，客户端可使用同一套数据解析逻辑。
				const response = (ctx.Success(await collectSystemInfo()) as unknown as Response<unknown>).getBody();
				ctx.res.write(`event: system\ndata: ${JSON.stringify(response)}\n\n`);
			} catch (error) {
				if (closed || ctx.res.writableEnded) {
					return;
				}
				const message = error instanceof Error ? error.message : 'Unable to collect system information';
				ctx.res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
			}
		};

		await new Promise<void>((resolve) => {
			ctx.res.once('close', () => {
				close();
				resolve();
			});
			ctx.res.once('error', () => {
				close();
				resolve();
			});

			const schedule = () => {
				if (closed) {
					return;
				}
				// 使用递归 setTimeout，确保一次采集结束后再开始下一次，避免采集任务重叠。
				timer = setTimeout(async () => {
					if (closed) {
						return;
					}
					await send();
					if (!closed) {
						schedule();
					}
				}, UPDATE_INTERVAL_MS);
			};

			// 连接建立后立即推送首条数据，后续再按固定间隔更新。
			void send().then(() => {
				if (!closed) {
					schedule();
				}
			});
		});
	}
}

async function collectSystemInfo() {
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
