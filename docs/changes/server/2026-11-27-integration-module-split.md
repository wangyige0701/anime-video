# 整合层拆分为 Bangumi 与 AI 两个独立模块

- 日期：2026-11-27
- 模块：server
- 类型：重构
- 涉及模块：server

## 背景

上一提交把 Bangumi 与 AI 的配置、HTTP 客户端放在同一个 `integrations/bangumi/` 目录下：`config.ts` 同时解析两个服务的配置，`http.ts` 里同时提到 Bangumi 与 OpenAI，类型文件 `types.ts` 只放 interface 却用了运行时文件后缀。

这带来三个问题：

1. **职责混乱**：AI 与 Bangumi 没有依赖关系，放在同一目录后，只改 Bangumi 也会碰到 AI 的代码与测试；将来任一方换成别的实现（例如换数据源或换模型供应商）都要动同一个文件。
2. **代理与密钥边界不清**：两个服务共用一份 `ServiceConfig`，容易在「AI 代理留空」时被误以为继承 Bangumi 代理。
3. **纯类型文件用了 `.ts`**：项目里 `types/videos.d.ts`、`shared/config.d.ts` 都是声明文件，只有 interface 的文件继续用 `.ts` 会让「这个文件有没有运行时导出」需要打开才能判断。

## 目标与取舍

- `integrations/` 下按服务拆目录，各自持有 `config.ts` 与客户端，互不 import。
- 两个服务真正共用的只有「`.env` 取值规则」和「JSON 请求」，上移到 `integrations/env.ts` 与 `integrations/http.ts`，它们不包含任何服务的键名或默认值。
- 纯类型文件改为 `.d.ts`。`EPISODE_TYPE` 是运行时枚举，不属于类型声明，移到唯一使用它的 `align.ts`。
- 对外行为不变：配置键、环境变量名、代理语义、重试策略全部保持一致。

不做的部分：不把提示词、编排流程放进通用层——它们属于「Bangumi 同步」这一业务，留在 bangumi 模块内。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `server/src/integrations/env.ts` | 新增 | 两个服务共用的 `.env` 解析与「进程环境 → `.env` → 默认值」取值 |
| `server/src/integrations/http.ts` | 由 `bangumi/http.ts` 上移 | 通用 JSON 请求，两侧共用 |
| `server/src/integrations/bangumi/config.ts` | 只保留 Bangumi 配置 | 解除与 AI 的耦合 |
| `server/src/integrations/ai/config.ts` | 新增 | AI 配置与完整性判定 |
| `server/src/integrations/bangumi/types.d.ts` | 由 `types.ts` 改名并移除枚举 | 纯类型用声明文件 |
| `server/src/integrations/bangumi/align.ts` | 内置 `EPISODE_TYPE` | 运行时常量不进类型声明文件 |
| `server/src/integrations/bangumi/client.ts` | 改用 `getBangumiConfig()` | 跟随配置拆分 |
| `test/server/bangumi-config.test.ts` | 改为只测 Bangumi 配置 | 测试与被测模块对应 |
| `test/server/ai-config.test.ts` | 新增 | AI 配置与代理独立性 |

## 实现要点

1. `env.ts` 只导出 `parseEnvText`、`readEnvFile`、`pickString`、`pickNumber` 四个与具体服务无关的函数，默认值由调用方传入。
2. 两个 `config.ts` 各自缓存自己的结果，`clear*ConfigCache()` 分开，测试互不影响。
3. `types.d.ts` 仅含 interface；`import type { BangumiEpisode } from './types'` 由 TypeScript 解析到声明文件，无需额外配置。
4. `EPISODE_TYPE` 只保留 `MAIN` 与 `SPECIAL`：其余类型本来就要丢弃，声明成完整枚举会让人误以为要处理。

## 行为变化与兼容性

- 不改变任何 HTTP 接口、数据落库与前端契约。
- 配置键与环境变量名保持不变，已有 `.env` 与 `config.yaml` 无需调整。
- `types.ts` 改名为 `types.d.ts` 后，导入路径仍是 `./types`，调用方无感。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec tsc -p server/tsconfig.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run test/server/bangumi-config.test.ts test/server/ai-config.test.ts`：11 个用例通过。

## 关联文档

- `docs/changes/server/2026-11-27-bangumi-client-config.md`
