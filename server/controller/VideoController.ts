import { Controller, HttpMethod, Inject, ResponseHeader, Singleton, Cors } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ServerRoot } from '~routes/server';
import { HlsManage } from '~server/src/hls';
import { NotFoundError } from '~server/src/error/notFound';
import { Series } from '~server/data/series';

@Singleton()
@Controller(ServerRoot.VIDEO)
@Cors()
export class VideoController {
	@HttpMethod.Get(`/:path/${__APP_CONFIG__.hls.masterM3u8Name}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	master(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).master();
	}

	@HttpMethod.Get(`/:path/${__APP_CONFIG__.hls.mediaM3u8Name}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	index(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).media_m3u8();
	}

	@HttpMethod.Get(`/:path/${__APP_CONFIG__.hls.imageM3u8Name}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	imageIndex(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).image_m3u8();
	}

	@HttpMethod.Get(`/:path/${__APP_CONFIG__.hls.imageM3u8Name}_init.mp4`)
	@ResponseHeader('Content-Type', 'video/mp4')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	imageInit(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).image_init();
	}

	@HttpMethod.Get('/:path/:id.m4s')
	@ResponseHeader('Content-Type', 'video/mp4')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	async image(@Inject('path', checkDirectory) path: string, @Inject('id', nonNegativeInteger) id: number) {
		const segment = await HlsManage.getHlsManage(path).image(id);
		if (!segment) {
			throw new NotFoundError('Not Found', `预览图不存在: ${id}`, 'text/plain');
		}
		return segment;
	}

	@HttpMethod.Get('/:path/:id.ts')
	@ResponseHeader('Content-Type', 'video/mp2t')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	async ts(@Inject('path', checkDirectory) path: string, @Inject('id', nonNegativeInteger) id: number) {
		const segment = await HlsManage.getHlsManage(path).ts(id);
		if (!segment) {
			throw new NotFoundError('Not Found', `分片不存在: ${id}`, 'text/plain');
		}
		return segment;
	}

	@HttpMethod.Get(`/:path/:stream/${__APP_CONFIG__.hls.subtitleM3u8Name}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	subtitle(@Inject('path', checkDirectory) path: string, @Inject('stream', nonNegativeInteger) stream: number) {
		return HlsManage.getHlsManage(path).subtitle_m3u8(stream);
	}

	@HttpMethod.Get('/:path/:stream/:id.vtt')
	@ResponseHeader('Content-Type', 'text/vtt')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	vtt(
		@Inject('path', checkDirectory) path: string,
		@Inject('stream', nonNegativeInteger) stream: number,
		@Inject('id', nonNegativeInteger) id: number,
	) {
		return HlsManage.getHlsManage(path).subtitle(stream, id);
	}
}

function nonNegativeInteger(value: string) {
	// 禁止 parseInt 的宽松行为，例如 "1abc" 被错误当作 1，或负数进入 HLS 层。
	if (!/^(0|[1-9]\d*)$/.test(value)) {
		throw new NotFoundError('Not Found', `无效的数字参数: ${value}`, 'text/plain');
	}
	const number = Number(value);
	if (!Number.isSafeInteger(number)) {
		throw new NotFoundError('Not Found', `无效的数字参数: ${value}`, 'text/plain');
	}
	return number;
}

async function checkDirectory(pathName: string) {
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(pathName);
	} catch {
		throw new NotFoundError('Not Found', '文件路径编码无效', 'text/plain');
	}
	const filePath = path.resolve(decodedPath);
	const extension = path.extname(filePath).toLowerCase();
	if (!(await Series.isAllowedDirectory(filePath))) {
		throw new NotFoundError('Not Found', `文件目录 ${filePath} 不被允许`, 'text/plain');
	}
	if (!__APP_CONFIG__.server.allowedVideoExtensions.includes(extension)) {
		throw new NotFoundError('Not Found', `文件扩展名无效 ${filePath}`, 'text/plain');
	}
	try {
		if (!(await fs.stat(filePath)).isFile()) {
			throw new NotFoundError('Not Found', `文件不存在 ${filePath}`, 'text/plain');
		}
	} catch (error) {
		throw new NotFoundError('Not Found', `文件不存在 ${filePath}`, 'text/plain');
	}
	return filePath;
}
