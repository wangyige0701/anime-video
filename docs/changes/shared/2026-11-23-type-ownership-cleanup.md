# 类型定义归位与响应解包注释

- 日期：2026-11-23
- 模块：shared
- 类型：重构
- 涉及模块：types、server

## 背景

`types/` 是跨端共享目录，但里面混了两类内容：真正的网络 DTO（`Series`/`Season`/`Episode`），以及只有服务端才会用到的结构类型 `ServerToPromise`。后者描述的是领域类「属性都是 Promise」这一服务端实现约定，前端从不引用，放在跨端目录里容易让人误以为它也属于接口契约。另外 `types/api.d.ts` 是 0 字节空文件。

`types/response.d.ts` 里的 `ResponseData<T>` 曾被误判为「恒等条件类型、可以删除」。实际它对应 `server/middlewares/response.ts` 的运行时行为：

```ts
constructor(public data: any, ...) {
	if (data instanceof Response) {
		return new Response(data.data, code, success, message);
	}
}
```

`ctx.Success(ctx.Success(dto))` 时运行时会剥掉一层包装，`ResponseData<T> = T extends Response<infer U> ? U : T` 正是这段逻辑的类型表达。只因现有调用点都不传 `Response`，它每次退化为 `T`，看起来才像恒等。删掉会让类型与运行时脱节。

## 改动

| 文件                                     | 改动                                           | 原因                               |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `types/api.d.ts`                         | 删除                                           | 0 字节空文件，无任何导出           |
| `types/videos.d.ts`                      | 移除 `ServerToPromise`                         | 服务端实现细节，不属于跨端 DTO     |
| `server/data/entity.ts`                  | 新增导出的 `ServerToPromise<T>`                | 与 `Entity` 同处，使用方只有领域类 |
| `server/data/{series,season,episode}.ts` | 从 `./entity` 导入 `ServerToPromise`           | 跟随定义位置                       |
| `types/response.d.ts`                    | 导出 `ResponseData` 并补充来源注释             | 避免再次被误判为冗余类型           |
| `server/AGENTS.md`                       | 补充「只描述服务端实现的结构类型放 `server/`」 | 明确 `types/` 的边界               |

## 行为变化与兼容性

- 纯类型与文档调整，无运行时改动。
- `ResponseData` 定义未变，只是从非导出改为导出并加注释；`Response<T>` 的 `data` 字段类型不变。
- HTTP 接口、DTO 形状、前端引用路径均未变化。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm --filter web type-check`：通过。
- `pnpm exec vitest run`：15 个文件、157 个用例全部通过（无行为改动，未新增用例）。
