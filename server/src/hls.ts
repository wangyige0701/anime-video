import type { Hls } from '@hls/hls.node';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ParallelTask } from '@wang-yige/utils';
import { M3u8Config, SEGMENT_MIN_DURATION } from '@config/hls';

const require = createRequire(import.meta.url);

/**
 * 接入缓存管理 Hls 实例
 */
export class HlsManage {
	/** 缓存所有 HlsManage 实例 */
	private static hlsBucket = new Map<string, HlsManage>();

	public static getHlsManage(inputPath: string) {
		return new HlsManage(inputPath);
	}

	/** 缓存单个 Hls 实例中已生成的分片 */
	private cache!: Array<Buffer>;
	/** 并行任务队列 */
	private task = new ParallelTask(5);
	/** 缓存单个 Hls 实例中已生成的分片的清除定时器 */
	private waitToClear = new Map<number, NodeJS.Timeout>();
	/** Hls 实例 */
	private hls!: Hls;
	/** Hls 实例分片数量 */
	private size = 0;
	/** Hls 实例输入路径 hash 值 */
	private hashPath!: string;
	private inputPath!: string;
	/** Hls 实例清除的定时器 */
	private gcTimeout!: NodeJS.Timeout;
	/** 当前正在生成的分片索引 */
	private currentIndex = 0;
	/** 清除缓存的分片索引最大范围 */
	private clearMaxRange = 50;
	/** 并行任务执行数量 */
	private runCount = 5;
	/** Hls 实例清除延迟时间 */
	private destroyDelay = 60 * 1000 * 5;

	constructor(inputPath: string) {
		const hashPath = crypto.createHash('sha256').update(path.normalize(inputPath)).digest('hex');
		// 如果缓存中已存在该 Hls 实例，则直接返回并重置清除定时器
		if (HlsManage.hlsBucket.has(hashPath)) {
			const hls = HlsManage.hlsBucket.get(hashPath)!;
			hls.resetGc();
			return hls;
		}
		HlsManage.hlsBucket.set(hashPath, this);

		this.inputPath = inputPath;
		this.hashPath = hashPath;

		this.getHls();
		this.size = this.getHls().size();
		this.cache = new Array(this.size);
	}

	private getHls(): Hls {
		if (!this.hls) {
			const HlsConstructor = require('@hls/hls.node') as typeof Hls;
			this.hls = new HlsConstructor(this.inputPath, SEGMENT_MIN_DURATION, {
				mediaM3u8Name: M3u8Config.MEDIA_M3U8_NAME,
				subtitleM3u8Name: M3u8Config.SUBTITLE_M3U8_NAME,
			});
		}
		return this.hls;
	}

	private log(...params: any[]) {
		// return console.log(...params);
	}

	public master() {
		return this.getHls().master();
	}

	public media_m3u8() {
		this.resetGc();
		return this.getHls().media_m3u8();
	}

	public async ts(index: number) {
		if (index < 0 || index >= this.size) {
			return undefined as unknown as Buffer;
		}

		this.currentIndex = index;

		this.resetGc();
		this.resetTsCacheClear();

		if (this.cache[index]) {
			this.log(`从缓存中获取 ${index} 分片`);
			// 向后检索两个分片，如果有一个没有缓存，则开始预加载
			for (let i = index + 1; i < this.size && i <= index + 2; i++) {
				if (this.cache[i]) {
					continue;
				}
				this.log(`开始预加载 ${i} 后的分片`);
				this.preloadTs(i);
				break;
			}
			return this.cache[index]!;
		}

		const ts = this.getHls().ts(index);
		this.log(`生成 ${index} 分片`);

		this.preloadTs(index + 1);

		const buffer = await ts;
		this.setTsCache(index, buffer);

		return buffer;
	}

	public subtitle_m3u8(streamIndex: number) {
		return this.getHls().subtitle_m3u8(streamIndex);
	}

	public subtitle(streamIndex: number, index: number) {
		return this.getHls().subtitle(streamIndex, index);
	}

	private preloadTs(index: number) {
		for (let i = index; i < this.size && i < index + this.runCount; i++) {
			this.task.add(async (index) => {
				if (index < 0 || index >= this.size) {
					return;
				}
				if (this.cache[index]) {
					return;
				}
				// hls 实例不存在时，跳过预加载行为
				if (!this.hls) {
					return;
				}
				const buffer = await this.getHls().ts(index);
				this.log(`生成 ${index} 分片`);
				this.setTsCache(index, buffer);
			}, i);
		}
	}

	/**
	 * 设置分片缓存
	 * @param index 分片索引
	 * @param buffer 分片数据
	 */
	private setTsCache(index: number, buffer: Buffer) {
		this.cache[index] = buffer;
	}

	/**
	 * 重置分片缓存移除定时器
	 * - 清除当前播放索引之后的所有索引的定时器
	 * - 对当前索引之前的所有未定时的分片设置定时器
	 */
	private resetTsCacheClear() {
		this.waitToClear.forEach((waitTime, i) => {
			if (i >= this.currentIndex && i <= this.currentIndex + this.clearMaxRange) {
				this.log(`清除 ${i} 分片缓存定时器`);
				waitTime && clearTimeout(waitTime);
				this.waitToClear.delete(i);
			}
		});
		// 重新计算需要清除缓存的分片索引
		this.cache.forEach((buffer, i) => {
			if (
				!buffer ||
				(i >= this.currentIndex && i <= this.currentIndex + this.clearMaxRange) ||
				this.waitToClear.has(i)
			) {
				return;
			}
			this.log(`设置 ${i} 分片缓存定时器`);
			this.waitToClear.set(i, setTimeout(this.clearTsCache.bind(this, i), 10 * 1000));
		});
	}

	/**
	 * 清除指定分片缓存
	 * @param index 分片索引
	 */
	private clearTsCache(index: number) {
		this.waitToClear.delete(index);
		if (index >= this.currentIndex && index <= this.currentIndex + this.clearMaxRange) {
			this.log(`${index} 分片缓存在当前播放序列之后，无需清除`);
			return;
		}
		this.log(`清除 ${index} 分片缓存`);
		this.cache[index] = undefined as unknown as Buffer;
	}

	/**
	 * 清除 Hls 实例缓存
	 */
	private gc() {
		this.gcTimeout = setTimeout(() => {
			this.log(`清除实例缓存`);

			if (this.hls) {
				this.hls.destroy();
			}
			this.hls = null as unknown as Hls;

			this.cache = new Array(this.size);
			this.waitToClear.clear();
			HlsManage.hlsBucket.delete(this.hashPath);
		}, this.destroyDelay);
	}

	/**
	 * 重置 Hls 实例清除定时器
	 */
	public resetGc() {
		if (this.gcTimeout) {
			clearTimeout(this.gcTimeout);
		}
		this.gc();
	}
}
