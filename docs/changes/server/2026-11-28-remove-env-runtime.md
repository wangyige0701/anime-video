# 配置来源切换到用户设置并删除 env 链路

- 日期：2026-11-28
- 模块：server
- 类型：重构
- 涉及模块：server、shared、scripts

## 背景

上一批（`baa44bd`）建立了用户设置存储与接口，但运行时仍走「`config.yaml` 默认值 → `.env` → 进程环境」的旧链路，设置页改了也不生效。`.env` 随应用分发时会整份泄露，`config.yaml` 里的 `ai.apiKey` 更是随仓库公开。

本次把 AI 与 Bangumi 的唯一配置来源切到 `settings.json`，并删除运行时 `.env` 读取链路。

## 改动

| 文件                                                   | 改动                                                     | 原因                                             |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| `server/src/integrations/ai/config.ts`                 | `resolveAiConfig(settings.ai)` 纯函数 + 异步 `getAiConfig()` | 唯一来源改为用户设置，删除 env 与进程缓存        |
| `server/src/integrations/bangumi/config.ts`            | `resolveBangumiConfig(settings.bangumi)` + 异步读取      | 同上；UA 为空时回退内置标识                      |
| `server/src/integrations/ai/client.ts`                 | 读一次设置后判定可用性并解析配置                         | 未配置提示改为「设置 → AI 接口」，不再出现 `AI_*` |
| `server/src/integrations/bangumi/client.ts`            | `endpoint()` 返回 `{ url, headers, timeout, proxy }`     | 四项来自同一份设置快照；未配置抛 503             |
| `server/src/integrations/env.ts`                       | 删除                                                     | 运行时不再读取 `.env`                            |
| `scripts/env.mjs`、`scripts/init-env.mjs`              | 删除                                                     | 配置不再由模板生成                               |
| `scripts/migrate-env.mjs`                              | 新增一次性迁移脚本                                       | 保留旧值搬运能力，不参与启动                     |
| `config.yaml`、`shared/config.d.ts`                    | 删除 `ai` 与 `bangumi` 两节                              | 随包分发的配置里不保留个人凭据                   |
| `.env.example`、`.gitignore` 的 `!.env.example` 例外 | 删除                                                     | 模板与生成脚本一并移除后，放行规则也无意义       |
| `test/server/{ai,bangumi}-config.test.ts`              | 改为测纯函数与归一化                                     | 不再 `vi.stubEnv`                                |
| `test/server/ai-client.test.ts`                        | 用临时用户数据目录准备设置                               | 不再 mock env，验证真实读取路径                  |
| `test/server/migrate-env.test.ts`                      | 10 个用例                                                | 解析、映射、优先级、只补空字段、预演不落盘       |
| `test/server/env-file.test.ts`                         | 删除                                                     | 被测模块已移除                                   |

## 关键取舍

1. **不自建缓存**：`readSettings()` 已有进程内快照且写入后更新，`getAiConfig()` / `getBangumiConfig()` 只是「读快照 → 归一化」。少一层缓存，就没有「保存后还要不要清缓存」的问题。
2. **一次读取、一组参数**：Bangumi 客户端的地址、UA、超时、代理来自同一次设置读取，避免用户保存时拼出「新地址 + 旧 UA」。
3. **未配置直接拒绝**：AI 缺地址/密钥/模型任一项、Bangumi 缺地址时抛 503 并提示去设置页，不发必然失败的请求。
4. **归一化在纯函数里做**：trim、去地址尾部斜杠、非法超时回退默认值；手改 `settings.json` 写坏字段也不会带崩请求。
5. **迁移只补空字段**：设置页已经填过的值不被旧 `.env` 顶回去；脚本只输出字段名，不打印任何值。

## 行为变化与兼容性

- 首次启动无需迁移：`settings.json` 缺失时按默认值创建（Bangumi 地址 `https://api.bgm.tv`、UA `anime-video/1.0`），服务照常启动。
- AI 默认值为空，未配置时详情页不显示同步入口（前端批次处理），接口层也会给出明确提示。
- 视频扫描、播放、合并等不涉及外部服务的功能不受影响。
- 本机 `.env` 已用迁移脚本写入 `settings.json` 后删除；`.env` 本身被 `.gitignore` 忽略，不进提交。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run`：全部用例通过（服务端 146 个，其中新增/重写配置与迁移用例）。
- 冒烟：`GET /data/settings` 返回默认视图；`PUT` 后 `settings.json` 落盘、响应脱敏；未配置 AI 时调用同步接口返回 503 且提示指向设置页。
- 迁移脚本：对本机 `.env` 执行后 `settings.json` 含全部 AI/Bangumi 字段；重复执行不覆盖已有值。

## 关联文档

- `docs/configuration.md`
- `docs/modules/server/bangumi-sync.md`
- `docs/changes/server/2026-11-28-user-settings-store.md`
