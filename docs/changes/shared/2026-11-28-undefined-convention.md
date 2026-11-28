# undefined 判断统一用 isUndefined，赋值统一用 void 0

- 日期：2026-11-28
- 模块：shared
- 类型：规范

## 背景

项目里 `undefined` 的写法定法不统一：既有 `=== undefined` / `!== undefined`，也有直接赋 `undefined` 的地方（含三元分支与 `return`）。统一为库提供的 `isUndefined()` 与 `void 0`，并在 AGENTS.md 中写成强制约定。

## 替换规则

| 原写法                        | 改成                           |
| ----------------------------- | ------------------------------ |
| `x !== undefined`             | `!isUndefined(x)`              |
| `x === undefined`             | `isUndefined(x)`               |
| `x = undefined`               | `x = void 0`                   |
| `cond ? a : undefined`        | `cond ? a : void 0`            |
| `return undefined`            | `return void 0`                |
| `typeof self === 'undefined'` | `isUndefined(globalThis.self)` |

`isUndefined` 来自 `@wang-yige/utils`，签名是 `(val: any): val is undefined`，所以 `!isUndefined(x)` 之后 TypeScript 仍能正常收窄，不需要额外的断言或非空断言。类型注解里的 `| undefined` 与可选属性 `foo?:` 不属于判断，保持原样。

## 具体改动

共 36 个文件：

- 服务端 13 个：`SettingsController`、`SystemController`、`data/data.ts`、`hls.ts`、`log-destination.ts`、`log-transport.ts`、`settings/store.ts`、`bangumi/{align,prompts,sync,tags}.ts`、`integrations/http.ts`、`cli/worker.ts`。
- 前端 20 个：详情页与图标组件的 `requestAnimationFrame` 守卫、`data/common.ts`、`stores/{player,system}.ts`、`utils/{bangumiSync,duration,date,hls-support}.ts`、`video/{VideoCore,VideoPlayer,useTimelinePreview,useHlsImagePreview}`、季与集拖拽、筛选与时间轴组件。
- 共享与脚本 3 个：`shared/config-parser.ts`、`scripts/migrate-env.ts`、`runtime/install-node-runtime.mjs`；另有一个服务端测试文件与 `test` 下的工具断言。

两处 `typeof self === 'undefined'`（`web/src/utils/hls-support.ts`）改为 `isUndefined(globalThis.self)`：裸 `self` 在无该全局的环境会抛 `ReferenceError`，而 `globalThis.self` 只会得到 `undefined`，语义与安全性都保持。

## 防回归

新增 `scripts/check-undefined.mjs`：扫描 `server`、`shared`、`web/src`、`types`、`scripts`、`test`、`runtime`、`desktop`、`installer`、`ui`，匹配 `=== undefined`、`!== undefined`、`= undefined`、`return undefined`、`=> undefined`、`?? undefined`、`|| undefined` 七种形态，命中即非零退出。当前 268 个文件通过。

根 `AGENTS.md` 的「代码格式要求」下新增「undefined 判断与赋值（强制）」小节，写明规则、类型收窄说明与提交前自检命令。

## 验证

- `node scripts/check-undefined.mjs`：268 个文件通过。
- `tsc -p server/tsconfig.build.json --noEmit`、`pnpm --filter web type-check`：无报错，说明改用类型守卫后没有收窄问题。
- `pnpm exec vitest run`：46 文件 449 例通过。

## 影响面

纯写法替换，无行为变化。唯一需要留意的是 `globalThis.self` 的改写：它把「访问可能不存在的全局」从 `typeof` 保护换成属性读取，结果一致但不会抛错。
