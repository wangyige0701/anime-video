import { Controller, HttpMethod, Inject, Types, ResponseHeader, Cross, Singleton } from 'koa-use-decorator-router';
import { HlsManage } from '@server/src/hls';
import { VIDEO_ROUTE } from '@config/route';
import { M3u8Config } from '@config/hls';

@Singleton()
@Controller(VIDEO_ROUTE)
@Cross()
export class VideoController {
	@HttpMethod.Get(`/:path/${M3u8Config.MASTER_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	master(@Inject('path', decodeURIComponent) path: string) {
		return HlsManage.getHlsManage(path).master();
	}

	@HttpMethod.Get(`/:path/${M3u8Config.MEDIA_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	index(@Inject('path', decodeURIComponent) path: string) {
		return HlsManage.getHlsManage(path).media_m3u8();
	}

	@HttpMethod.Get('/:path/:id.ts')
	@ResponseHeader('Content-Type', 'video/mp2t')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	async ts(@Inject('path', decodeURIComponent) path: string, @Inject('id', Types.Int) id: number) {
		return await HlsManage.getHlsManage(path).ts(id);
	}

	@HttpMethod.Get(`/:path/:stream/${M3u8Config.SUBTITLE_M3U8_NAME}.m3u8`)
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	subtitle(@Inject('path', decodeURIComponent) path: string, @Inject('stream', Types.Int) stream: number) {
		return HlsManage.getHlsManage(path).subtitle_m3u8(stream);
	}

	@HttpMethod.Get('/:path/:stream/:id.vtt')
	@ResponseHeader('Content-Type', 'text/vtt')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	vtt(
		@Inject('path', decodeURIComponent) path: string,
		@Inject('stream', Types.Int) stream: number,
		@Inject('id', Types.Int) id: number,
	) {
		return HlsManage.getHlsManage(path).subtitle(stream, id);
	}
}
