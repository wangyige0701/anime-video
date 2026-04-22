import Koa from 'koa';
import { Context, Controller, HttpMethod, Inject, ResponseHeader, Singleton } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ServerRoot } from '~routes/server';

const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

@Singleton()
@Controller(ServerRoot.IMAGE)
@ResponseHeader('Access-Control-Allow-Methods', 'GET')
@ResponseHeader('Access-Control-Allow-Origin', '*')
@ResponseHeader('Access-Control-Allow-Headers', 'Content-Type')
@ResponseHeader('Cache-Control', 'public, max-age=3600000')
export class ImageController {
	@HttpMethod.Get('/:path')
	public async getImage(@Context() ctx: Koa.Context, @Inject('path', decodeURIComponent) pathName: string) {
		const extension = path.extname(pathName).toLowerCase();
		if (!allowedImageExtensions.includes(extension)) {
			throw new Error('Invalid image extension');
		}

		const data = await fs.readFile(pathName);

		ctx.type = `image/${extension.slice(1)}`;
		ctx.set('Content-Length', data.length.toString());

		return data;
	}
}
