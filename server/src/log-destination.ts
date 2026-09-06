import type { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { LOG_CLOSE } from './log-protocol.js';

interface WorkerTransport extends EventEmitter {
	write(data: string): boolean;
	flush(callback: (error?: Error) => void): void;
	worker?: Pick<Worker, 'terminate'>;
}

/** Pino 的同步入口不能等待磁盘，使用有界队列吸收突发并明确报告过载。 */
export class LogDestination {
	private queue: string[] = [];
	private pendingBytes = 0;
	private busy = false;
	private scheduled: NodeJS.Immediate | undefined;
	private closing = false;
	private closeRequested = false;
	private closed = false;
	private failure: Error | undefined;
	private closePromise: Promise<void> | undefined;
	private flushWaiters: ((error?: Error) => void)[] = [];
	private dropped = 0;

	constructor(
		private readonly transport: WorkerTransport,
		private readonly maxQueueBytes: number,
		private readonly report: (message: string) => void = (message) => process.stderr.write(`[logger] ${message}\n`),
	) {
		if (!Number.isSafeInteger(maxQueueBytes) || maxQueueBytes <= 0) {
			throw new Error('Invalid logging.maxQueueBytes');
		}
		transport.on('error', (error: Error) => this.fail(error));
		transport.on('close', () => {
			this.closed = true;
			if (!this.closeRequested) {
				this.fail(new Error('Log worker closed unexpectedly'));
			}
		});
	}

	get bufferedBytes() {
		return this.pendingBytes;
	}

	write(data: string) {
		if (!data || this.closing || this.failure) {
			return;
		}
		const bytes = Buffer.byteLength(data);
		// 上限包含在途批次；单条超大记录也不能绕过队列上限。
		if (this.pendingBytes + bytes > this.maxQueueBytes) {
			if (this.dropped++ === 0) {
				this.report('Log queue full; dropping new records until capacity is available');
			}
			return;
		}
		this.queue.push(data);
		this.pendingBytes += bytes;
		if (!this.busy && !this.scheduled) {
			this.scheduled = setImmediate(() => {
				this.scheduled = undefined;
				this.pump();
			});
		}
	}

	private pump() {
		if (this.busy || this.failure || !this.queue.length) {
			return;
		}
		const data = this.queue.join('');
		this.queue = [];
		const bytes = this.pendingBytes;
		this.busy = true;
		try {
			this.transport.write(data);
			// 每次仅一个批次在途，确认 worker 接收后归还额度；文件缓冲仍由 worker 管理。
			this.transport.flush((error) => {
				if (this.failure) {
					return;
				}
				if (error) {
					this.fail(error);
					return;
				}
				this.pendingBytes -= bytes;
				this.busy = false;
				if (this.queue.length) {
					this.pump();
				} else {
					this.reportDrops();
					this.completeFlushes();
				}
			});
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	flush(callback: (error?: Error) => void) {
		if (this.failure) {
			callback(this.failure);
		} else if (this.busy || this.queue.length) {
			this.flushWaiters.push(callback);
		} else {
			try {
				this.transport.flush((error) => {
					if (error) {
						this.fail(error);
					}
					callback(error);
				});
			} catch (error) {
				const failure = error instanceof Error ? error : new Error(String(error));
				this.fail(failure);
				callback(failure);
			}
		}
	}

	private completeFlushes(error?: Error) {
		for (const callback of this.flushWaiters.splice(0)) {
			callback(error);
		}
	}

	private reportDrops() {
		if (this.dropped) {
			this.report(`Dropped ${this.dropped} log records because the queue limit was exceeded`);
			this.dropped = 0;
		}
	}

	private fail(error: Error) {
		if (!this.failure) {
			this.failure = error;
			clearImmediate(this.scheduled);
			this.queue = [];
			this.pendingBytes = 0;
			this.report(`Log transport failed: ${error.message}`);
			this.reportDrops();
			this.completeFlushes(error);
		}
	}

	close(timeoutMs = 5_000) {
		if (!this.closePromise) {
			this.closing = true;
			this.closePromise = new Promise<void>((resolve, reject) => {
				let settled = false;
				const complete = (error?: Error) => {
					if (settled) {
						return;
					}
					settled = true;
					clearTimeout(timer);
					this.transport.off('close', onClose);
					this.transport.off('error', onError);
					this.reportDrops();
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				};
				const onClose = () => complete(this.failure);
				const onError = (error: Error) => complete(error);
				const timer = setTimeout(() => {
					const error = new Error(`Log transport close timed out after ${timeoutMs}ms`);
					this.fail(error);
					complete(error);
					void this.transport.worker?.terminate().catch((failure: unknown) => this.report(String(failure)));
				}, timeoutMs);
				this.transport.once('close', onClose);
				this.transport.once('error', onError);
				if (this.closed || this.failure) {
					complete(this.failure);
					return;
				}
				this.flush((error) => {
					if (settled) {
						return;
					}
					if (error) {
						complete(error);
					} else {
						// 不调用 ThreadStream.end()，避免它的同步等待阻塞主线程超时。
						this.closeRequested = true;
						this.transport.emit('message', { code: LOG_CLOSE });
					}
				});
			});
		}
		return this.closePromise;
	}
}
