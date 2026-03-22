import { Controller, HttpMethod, Inject, Types, ResponseHeader, Cross } from '@server/koa/decorators';
import { HlsManage } from '@server/src/hls';

@Controller('/video', true)
@Cross()
export class VideoController {
	@HttpMethod.Get('/:path/master.m3u8')
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	master(@Inject('path', decodeURIComponent) path: string) {
		return HlsManage.getHlsManage(path).master();
	}

	@HttpMethod.Get('/:path/index.m3u8')
	@ResponseHeader('Content-Type', 'application/vnd.apple.mpegurl')
	@ResponseHeader('Cache-Control', 'no-cache')
	index(@Inject('path', decodeURIComponent) path: string) {
		return HlsManage.getHlsManage(path).m3u8();
	}

	@HttpMethod.Get('/:path/:id.ts')
	@ResponseHeader('Content-Type', 'video/mp2t')
	@ResponseHeader('Cache-Control', 'public, max-age=3600')
	async ts(@Inject('path', decodeURIComponent) path: string, @Inject('id', Types.Int) id: number) {
		return await HlsManage.getHlsManage(path).ts(id);
	}

	@HttpMethod.Get('/:path/:stream.m3u8')
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
