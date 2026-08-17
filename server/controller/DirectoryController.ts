import type Koa from 'koa';
import { Context, Controller, Cors, HttpMethod, Singleton } from 'koa-use-decorator-router';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Status } from '~common/status';
import { ServerRoot } from '~routes/server';
import { Series } from '~server/data/series';
import { Validate } from '~server/decorators/validate';
import { Response } from '~server/middlewares/response';
import { ApiError } from '~server/src/error';
import { isDirectory } from '~server/src/utils/fs';

@Singleton()
@Controller(ServerRoot.DATA)
@Cors()
export class DataController {
	@HttpMethod.Get('/directories')
	public async getDirectories(@Context() ctx: Koa.Context) {
		// 路由层只会等待控制器返回值，不会递归等待 Response.data 中的 Promise。
		return ctx.Success(await Series.getDirectories());
	}

	@HttpMethod.Put('/directories')
	@Validate((z) => z.array(z.string().trim().min(1)))
	public async setDirectories(@Context() ctx: Koa.Context) {
		const directories = await normalizeDirectories(ctx.request.body as string[]);
		await Series.setDirectories(...directories);
		await Series.updateSeries();
		ctx.log.info({ event: 'directories.updated', count: directories.length }, 'Data directories updated');
		return ctx.Success();
	}
}

async function normalizeDirectories(directories: string[]) {
	const normalizedDirectories = new Set<string>();
	for (const directory of directories) {
		const resolvedDirectory = path.resolve(directory);
		if (!(await isDirectory(resolvedDirectory))) {
			throw badDirectoryRequest(`目录不存在或不是文件夹: ${directory}`);
		}

		let realDirectory: string;
		try {
			// realpath 同时消除路径格式差异和指向同一目录的符号链接/Junction。
			realDirectory = await fs.realpath(resolvedDirectory);
		} catch {
			// 目录可能在 stat 与 realpath 之间被删除，仍按无效输入而不是 500 返回。
			throw badDirectoryRequest(`目录不存在或无法访问: ${directory}`);
		}
		if (normalizedDirectories.has(realDirectory)) {
			throw badDirectoryRequest(`目录重复: ${directory}`);
		}
		normalizedDirectories.add(realDirectory);
	}
	return [...normalizedDirectories];
}

function badDirectoryRequest(message: string) {
	return new ApiError(Status.Failed, new Response(null, Status.Failed, false, message));
}
