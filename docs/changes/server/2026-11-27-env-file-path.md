# 修复从 server 目录启动时读不到仓库根 `.env` 的问题

- 日期：2026-11-27
- 模块：server
- 类型：修复

## 背景

本地联调 Bangumi 同步时，`POST /data/series/:id/bangumi/match` 稳定在 15 秒后返回 500，日志里是 `请求超时（15000ms）`。直连 Bangumi 不通、代理可用，但 `.env` 里配好的 `BGM_PROXY` 明显没有生效。

## 根因

`server/src/integrations/env.ts` 的默认 `.env` 路径是 `path.resolve(process.cwd(), '.env')`，而实际启动方式决定了 cwd 是 `server/`：

- `back.cmd` → `pnpm --dir <root> --filter server run dev`，pnpm 以包目录作为脚本 cwd；
- 手动 `cd server && pnpm run dev` 同理。

`.env` 由 `scripts/init-env.mjs` 生成在**仓库根目录**（`scripts/env.mjs` 的 `ENV_FILE`），于是从 `server/` 出发永远找不到它：代理、`AI_API_KEY` 等全部被静默忽略，配置回落到 `config.yaml` 的默认值（空代理、无密钥）。

这类失败不会报「配置缺失」，只表现为超时或「AI 未配置」，排查成本很高，属于必须修掉的问题。

## 修复

`readEnvFile()` 的默认路径改为 `resolveEnvFile()`：

1. 先看 `process.cwd()/.env`：手动在任意目录启动服务时，仍以 cwd 的配置为准；
2. 再看模块位置上溯三级的 `.env`：源码路径 `server/src/integrations` 上溯三级即仓库根；
3. 都不存在时退回 cwd 下的路径（读不到就是空配置，行为与修复前一致）。

打包产物里 `.env` 本就不参与配置，多找一次没有副作用；`resolveEnvFile(startCwd, startModule)` 把两个起点做成参数，便于用临时目录做隔离测试。

## 涉及文件

| 文件                             | 改动                                |
| -------------------------------- | ----------------------------------- |
| `server/src/integrations/env.ts` | 新增 `resolveEnvFile()`，改默认路径 |
| `test/server/env-file.test.ts`   | 4 个用例覆盖定位顺序与回退          |

## 验证

- 修复前：`cd server && tsx` 读到的 env 键为 0，`getBangumiConfig().proxy` 为空。
- 修复后：同一位置读到 7 个键，`proxy` 有值，`match` 接口正常返回候选条目。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run`：30 个文件 302 个用例通过。
