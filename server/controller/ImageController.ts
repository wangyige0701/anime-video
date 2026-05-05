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
import fs from 'node:fs';
import { ServerRoot } from '~routes/server';
import { isAllowedDirectory } from '@server/src/videos';
import { ImageNotFoundError } from '@server/src/error/imageNotFound';
import { allowedImageExtensions } from '@config/server';

function checkDirectory(pathName: string): string {
	const imagePath = decodeURIComponent(pathName);
	const extension = path.extname(imagePath).toLowerCase();
	if (!isAllowedDirectory(imagePath)) {
		throw new ImageNotFoundError('Image not allowed in this directory', imagePath);
	}
	if (!allowedImageExtensions.includes(extension)) {
		throw new ImageNotFoundError('Invalid image extension', imagePath);
	}
	if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
		throw new ImageNotFoundError('Image not found', imagePath);
	}
	return imagePath;
}

@Singleton()
@Controller(ServerRoot.IMAGE)
@Cors('*', 'Content-Type', Methods.GET)
@ResponseHeader('Cache-Control', 'public, max-age=3600000')
export class ImageController {
	@HttpMethod.Get('/:path')
	public async getImage(@Context() ctx: Koa.Context, @Inject('path', checkDirectory) imagePath: string) {
		const extension = path.extname(imagePath).toLowerCase();
		const data = fs.readFileSync(imagePath);

		ctx.type = `image/${extension.slice(1)}`;
		ctx.set('Content-Length', data.length.toString());

		return data;
	}
}
