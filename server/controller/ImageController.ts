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
import fs from 'node:fs/promises';
import { ServerRoot } from '~routes/server';
import { ImageNotFoundError } from '~server/src/error/notFound';
import { allowedImageExtensions } from '~config/server';
import { Series } from '~server/data/series';

@Singleton()
@Controller(ServerRoot.IMAGE)
@Cors('*', 'Content-Type', Methods.GET)
@ResponseHeader('Cache-Control', 'public, max-age=3600000')
export class ImageController {
	@HttpMethod.Get('/:path')
	public async getImage(@Context() ctx: Koa.Context, @Inject('path', checkDirectory) imagePath: string) {
		const extension = path.extname(imagePath).toLowerCase();
		const data = await fs.readFile(imagePath);

		ctx.type = `image/${extension.slice(1)}`;
		ctx.set('Content-Length', data.length.toString());

		return data;
	}
}

async function checkDirectory(pathName: string): Promise<string> {
	const imagePath = path.resolve(decodeURIComponent(pathName));
	const extension = path.extname(imagePath).toLowerCase();
	if (!(await Series.isAllowedDirectory(imagePath))) {
		throw new ImageNotFoundError('文件目录不允许访问', imagePath);
	}
	if (!allowedImageExtensions.includes(extension)) {
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
