import { Controller, HttpMethod, Inject, Types, ResponseHeader, Singleton, Cors } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import { HlsManage } from '@server/src/hls';
import { ServerRoot } from '~routes/server';
import { M3u8Config } from '~config/hls';
import { isAllowedDirectory } from '@server/src/videos';
import { NotFoundError } from '@server/src/error/notFound';
import { allowedVideoExtensions } from '~config/server';

@Singleton()
@Controller(ServerRoot.VIDEO)
@Cors()
export class VideoController {
	@HttpMethod.Get(`/:path/${M3u8Config.MASTER_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	master(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).master();
	}

	@HttpMethod.Get(`/:path/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	index(@Inject('path', checkDirectory) path: string) {
		return HlsManage.getHlsManage(path).media_m3u8();
	}

	@HttpMethod.Get('/:path/:id.ts')
	@ResponseHeader('Content-Type', 'video/mp2t')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	async ts(@Inject('path', checkDirectory) path: string, @Inject('id', Types.Int) id: number) {
		return await HlsManage.getHlsManage(path).ts(id);
	}

	@HttpMethod.Get(`/:path/:stream/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	subtitle(@Inject('path', checkDirectory) path: string, @Inject('stream', Types.Int) stream: number) {
		return HlsManage.getHlsManage(path).subtitle_m3u8(stream);
	}

	@HttpMethod.Get('/:path/:stream/:id.vtt')
	@ResponseHeader('Content-Type', 'text/vtt')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	vtt(
		@Inject('path', checkDirectory) path: string,
		@Inject('stream', Types.Int) stream: number,
		@Inject('id', Types.Int) id: number,
	) {
		return HlsManage.getHlsManage(path).subtitle(stream, id);
	}
}

async function checkDirectory(pathName: string) {
	const filePath = decodeURIComponent(pathName);
	const extension = path.extname(filePath).toLowerCase();
	if (!(await isAllowedDirectory(filePath))) {
		throw new NotFoundError('Not Found', `File not allowed in this directory ${filePath}`, 'text/plain');
	}
	if (!allowedVideoExtensions.includes(extension)) {
		throw new NotFoundError('Not Found', `Invalid video extension ${filePath}`, 'text/plain');
	}
	try {
		if (!(await fs.stat(filePath)).isFile()) {
			throw new NotFoundError('Not Found', `Video not found ${filePath}`, 'text/plain');
		}
	} catch (error) {
		throw new NotFoundError('Not Found', `Video not found ${filePath}`, 'text/plain');
	}
	return filePath;
}
