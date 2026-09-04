import Koa from 'koa';
import {
	Context,
	Controller,
	Cors,
	HttpMethod,
	Inject,
	Methods,
	ResponseHeader,
	Singleton,
} from 'koa-use-decorator-router';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { ServerRoot } from '~routes/server';
import { ImageNotFoundError } from '~server/src/error/notFound';
import { Series } from '~server/data/series';

const SERVER = __APP_CONFIG__.server;

@Singleton()
@Controller(ServerRoot.IMAGE)
@Cors('*', 'Content-Type', Methods.GET)
@ResponseHeader('Cache-Control', 'public, max-age=86400')
export class ImageController {
	@HttpMethod.Get('/:path')
	public async getImage(@Context() ctx: Koa.Context, @Inject('path', checkDirectory) imagePath: string) {
		const extension = path.extname(imagePath).toLowerCase();
		const stats = await fs.stat(imagePath);

		// 由 Koa 的 mime 映射生成标准 MIME，例如 .jpg 会得到 image/jpeg。
		ctx.type = extension;
		ctx.set('Content-Length', stats.size.toString());

		// 文件内容不再整体驻留内存，大图和并发请求会按流的背压逐段发送。
		return createReadStream(imagePath);
	}
}

async function checkDirectory(pathName: string): Promise<string> {
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(pathName);
	} catch {
		throw new ImageNotFoundError('文件路径编码无效');
	}
	const imagePath = path.resolve(decodedPath);
	const extension = path.extname(imagePath).toLowerCase();
	if (!(await Series.isAllowedDirectory(imagePath))) {
		throw new ImageNotFoundError('文件目录不允许访问', imagePath);
	}
	if (!SERVER.allowedImageExtensions.includes(extension)) {
		throw new ImageNotFoundError('文件扩展名无效', imagePath);
	}
	try {
		if (!(await fs.stat(imagePath)).isFile()) {
			throw new ImageNotFoundError('文件不存在', imagePath);
		}
	} catch (error) {
		throw new ImageNotFoundError('文件不存在', imagePath);
	}
	return imagePath;
}
