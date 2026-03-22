import 'reflect-metadata';

import type { Middleware } from 'koa';
import type Koa from 'koa';
import type { AllowedMethodsOptions } from '@koa/router';
import fs from 'node:fs';
import { resolve } from 'node:path';
import Router from '@koa/router';

interface DecoratorsOptions {
	/** 绝对路径 */
	absoluteDir: string;
	allowedMethods?: boolean | AllowedMethodsOptions;
}

interface ControllerMethod {
	path: string;
	method: HttpMethods;
	handler: string;
}

interface InjectMetadata {
	isContext?: boolean;
	paramName: string;
	type?: Types | ((param: string) => any);
	parameterIndex: number;
}

interface ResponseHeaderMetadata {
	header: string;
	value: string;
}

export enum HttpMethods {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	DELETE = 'DELETE',
	OPTIONS = 'OPTIONS',
}

export enum Types {
	Int = 'int',
	Float = 'float',
	String = 'string',
	Boolean = 'boolean',
}

const route = new Router();
const ROUTES = Symbol.for('routes');
const CONTROLLER = Symbol.for('controller');
const IS_SINGLETON = Symbol.for('isSingleton');
const SINGLETON = Symbol.for('singleton');
const INJECT = Symbol.for('inject');
const RESPONSE_HEADER = Symbol.for('responseHeader');
const RESPONSE_HEADER_GLOBAL = Symbol.for('responseHeaderGlobal');

const TypeMapFunction = {
	[Types.Int]: (param: string) => parseInt(param, 10) || 0,
	[Types.Float]: (param: string) => parseFloat(param) || 0,
	[Types.String]: (param: string) => String(param),
	[Types.Boolean]: (param: string) => param === 'true',
};

/**
 * 装饰器中间件
 * @param options 装饰器选项
 * @param options.allowedMethods 允许的方法，`@koa/router.allowedMethods` 选项
 */
export function decorators(options: DecoratorsOptions): Middleware {
	return async (ctx, next) => {
		if (!options.absoluteDir) {
			throw new Error('basePath is required');
		}
		const absoluteDir = options.absoluteDir;
		if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
			throw new Error(`absoluteDir ${absoluteDir} not exists`);
		}
		const files = fs.readdirSync(absoluteDir);
		for (const file of files) {
			if (!file.endsWith('Controller.ts') && !file.endsWith('Controller.js')) {
				continue;
			}

			const controller = require(resolve(absoluteDir, file)) as Record<string, any>;
			for (const controllerClass of Object.values(controller)) {
				const controllerPath = Reflect.getMetadata(CONTROLLER, controllerClass);
				if (!controllerPath) {
					continue;
				}
				// 单例模式
				let isSingleton = Reflect.getMetadata(IS_SINGLETON, controllerClass);
				if (typeof isSingleton !== 'boolean') {
					isSingleton = true;
				}
				const routes = (Reflect.getMetadata(ROUTES, controllerClass) || []) as ControllerMethod[];
				for (const routeItem of routes) {
					// 只在设置 route 时重写一次函数体，避免嵌套过多
					const path = controllerPath + (!routeItem.path.startsWith('/') ? '/' : '') + routeItem.path;
					const method = routeItem.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'options';
					const handler = routeItem.handler;

					route[method](path, async (ctx) => {
						const responseHeaders = (Reflect.getMetadata(RESPONSE_HEADER, controllerClass, handler) ||
							[]) as ResponseHeaderMetadata[];
						const responseHeaderGlobal = (Reflect.getMetadata(RESPONSE_HEADER_GLOBAL, controllerClass) ||
							[]) as ResponseHeaderMetadata[];
						for (const header of [...responseHeaderGlobal, ...responseHeaders]) {
							ctx.set(header.header, header.value || '');
						}
						if (isSingleton) {
							if (!Reflect.hasMetadata(SINGLETON, controllerClass)) {
								Reflect.defineMetadata(SINGLETON, new controllerClass(), controllerClass);
							}
							const singleton = Reflect.getMetadata(SINGLETON, controllerClass);
							ctx.body = await singleton[handler](ctx);
						} else {
							ctx.body = await new controllerClass()[handler](ctx);
						}
					});
				}
			}
		}

		ctx.app.use(route.routes());
		if (typeof options.allowedMethods === 'boolean') {
			if (options.allowedMethods) {
				ctx.app.use(route.allowedMethods());
			}
		} else if (options.allowedMethods) {
			ctx.app.use(route.allowedMethods(options.allowedMethods));
		}

		await next();
	};
}

/**
 * 控制器装饰器
 * @param basePath 控制器路径
 */
export function Controller(basePath: string, isSingleton = true) {
	return (target: any) => {
		Reflect.defineMetadata(CONTROLLER, basePath, target);
		Reflect.defineMetadata(IS_SINGLETON, isSingleton, target);
		return target;
	};
}

function Action(path: string, method: HttpMethods) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const routes = Reflect.getMetadata(ROUTES, target.constructor) || ([] as ControllerMethod[]);

		const oldValue = descriptor.value;
		descriptor.value = async (ctx: Koa.Context) => {
			const injects = Reflect.getMetadata(INJECT, target.constructor, propertyKey) as InjectMetadata[];

			const params = ctx.params;
			const injectParams = [];
			for (const inject of injects) {
				if (inject.isContext) {
					injectParams[inject.parameterIndex] = ctx;
					continue;
				}
				let param = params[inject.paramName] ?? void 0;
				if (typeof inject.type === 'string') {
					if (TypeMapFunction[inject.type]) {
						param = TypeMapFunction[inject.type](param);
					}
				} else if (typeof inject.type === 'function') {
					param = inject.type(param);
				}
				injectParams[inject.parameterIndex] = param;
			}

			return await oldValue(...injectParams);
		};

		routes.push({
			path: path,
			method: method,
			handler: propertyKey,
		});

		Reflect.defineMetadata(ROUTES, routes, target.constructor);

		return descriptor;
	};
}

const methods = ['Get', 'Post', 'Put', 'Delete'] as const;
const methodMap = {
	Get: HttpMethods.GET,
	Post: HttpMethods.POST,
	Put: HttpMethods.PUT,
	Delete: HttpMethods.DELETE,
	Options: HttpMethods.OPTIONS,
};

export const HttpMethod = methods.reduce(
	(prev, curr) => {
		prev[curr] = (path: string) => Action(path, methodMap[curr]);
		return prev;
	},
	{} as Record<(typeof methods)[number], (path: string) => ReturnType<typeof Action>>,
);

/**
 * 注入装饰器，用于注入路由参数
 * @param paramName 参数名
 * @param type 参数类型，默认不转换，可以传入 Types 枚举值或自定义转换函数
 */
export function Inject(paramName: string, type?: Types | ((param: string) => any)) {
	return (target: any, propertyKey: string, parameterIndex: number) => {
		const inject = (Reflect.getMetadata(INJECT, target.constructor, propertyKey) || []) as InjectMetadata[];

		inject.push({
			paramName,
			type,
			parameterIndex,
		});

		Reflect.defineMetadata(INJECT, inject, target.constructor, propertyKey);
	};
}

/**
 * 上下文装饰器，用于注入 `Koa.Context`
 */
export function Context() {
	return (target: any, propertyKey: string, parameterIndex: number) => {
		const injects = (Reflect.getMetadata(INJECT, target.constructor, propertyKey) || []) as InjectMetadata[];

		if (injects.find((item) => item.isContext)) {
			return;
		}

		injects.push({
			isContext: true,
			paramName: 'ctx',
			parameterIndex,
		});
		injects.sort((a, b) => a.parameterIndex - b.parameterIndex);

		Reflect.defineMetadata(INJECT, injects, target.constructor, propertyKey);
	};
}

export function ResponseHeader(header: string, value: string) {
	function result(target: any): any;
	function result(target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor;
	function result(target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
		const data = {
			header,
			value,
		} as ResponseHeaderMetadata;

		if (propertyKey) {
			const responseHeader = (Reflect.getMetadata(RESPONSE_HEADER, target.constructor, propertyKey) ||
				[]) as ResponseHeaderMetadata[];
			responseHeader.push(data);
			Reflect.defineMetadata(RESPONSE_HEADER, responseHeader, target.constructor, propertyKey);
			return descriptor;
		}
		const responseHeader = (Reflect.getMetadata(RESPONSE_HEADER_GLOBAL, target) || []) as ResponseHeaderMetadata[];
		responseHeader.push(data);
		Reflect.defineMetadata(RESPONSE_HEADER_GLOBAL, responseHeader, target);
		return target;
	}
	return result;
}

export function Cross(
	origin: string | string[] = '*',
	headers: string | string[] = ['Content-Type', 'Authorization'],
	methods: HttpMethods | HttpMethods[] = [
		HttpMethods.GET,
		HttpMethods.POST,
		HttpMethods.PUT,
		HttpMethods.DELETE,
		HttpMethods.OPTIONS,
	],
) {
	if (typeof origin === 'string') {
		origin = [origin];
	}
	if (typeof headers === 'string') {
		headers = [headers];
	}
	if (typeof methods === 'string') {
		methods = [methods];
	}

	const originHeader = ResponseHeader('Access-Control-Allow-Origin', origin.join(','));
	const headerHeader = ResponseHeader('Access-Control-Allow-Headers', headers.join(','));
	const methodHeader = ResponseHeader('Access-Control-Allow-Methods', methods.join(','));

	function result(target: any): any;
	function result(target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor;
	function result(target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
		if (propertyKey) {
			originHeader(target, propertyKey, descriptor!);
			headerHeader(target, propertyKey, descriptor!);
			methodHeader(target, propertyKey, descriptor!);
			return descriptor;
		}
		originHeader(target);
		headerHeader(target);
		methodHeader(target);
		return target;
	}
	return result;
}
