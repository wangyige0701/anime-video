# 新增 Bangumi 与 AI 的服务配置和 HTTP 客户端

- 日期：2026-11-27
- 模块：server
- 类型：功能
- 涉及模块：server、shared

## 背景

Bangumi 数据同步需要访问两个外部服务：`api.bgm.tv`（只读，无需 token）和 OpenAI 兼容的 AI 接口。项目现有配置系统只能表达静态配置，没有外部请求需要的代理、超时和密钥注入方式；服务端也没有可复用的 HTTP 客户端（现有代码只处理本地文件与 HLS 原生扩展）。

前置验证脚本放在 `.cache/` 里，确认了接口可用性和字段语义，但脚本自带一套 env 解析和请求实现，不能直接进服务端。

## 目标与取舍

- 配置纳入 `config.yaml`，复用现有环境变量覆盖机制（`BANGUMI_BASE_URL`、`AI_API_KEY` 等自动生效），不引入新的配置入口。
- 本地 `.env` 与服务端共用一份，但要避免「配置解析在模块导入时完成、`.env` 还没注入」的时序问题。
- HTTP 客户端零依赖：不引入 `undici`/`axios`/`dotenv`，避免为一个只读接口增加安装和发布体积。
- AI 代理与 Bangumi 代理完全独立。有些模型服务本身不需要代理，复用会产生「配了 Bangumi 代理后 AI 请求绕一圈」的隐性问题。

## 涉及文件

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `config.yaml` | 新增 `bangumi`、`ai` 两节 | 提供可发现的默认值与注释 |
| `shared/config.d.ts` | 同步两节类型 | 配置契约 |
| `server/src/integrations/bangumi/config.ts` | 合并进程环境、`.env`、默认值；AI 完整性判定 | 解决 `.env` 注入时序 |
| `server/src/integrations/bangumi/http.ts` | `requestJson` / `requestJsonWithRetry`，CONNECT 隧道 | 支持代理与限流退避 |
| `server/src/integrations/bangumi/types.ts` | v0 API 响应类型与 `EPISODE_TYPE` | 固定字段语义 |
| `server/src/integrations/bangumi/client.ts` | 搜索、条目详情、剧集分页 | Bangumi 只读封装 |
| `test/server/bangumi-config.test.ts` | 配置优先级与 `.env` 解析测试 | 防止来源覆盖顺序退错 |

## 实现要点

1. **配置优先级**：进程环境 → `.env` → `config.yaml`。`config-parser` 已经把进程环境合并进 `__APP_CONFIG__`，但无法区分「来自环境」与「来自默认值」，因此 `config.ts` 直接读 `process.env` 判断显式覆盖，再退到 `.env`，最后用默认值。这样 `config.yaml` 的默认值不会永久压住 `.env`。
2. **兼容两套前缀**：`.env` 里 Bangumi 相关变量沿用调试脚本的 `BGM_*`，服务端配置项对应 `BANGUMI_*`，两者都接受，避免同一台机器维护两份变量。
3. **代理**：只有 https 目标才建立 CONNECT 隧道，隧道 socket 直接交给 `https.request`，`agent: false` 防止连接池复用已绑定的 socket。代理失败会明确报「代理 CONNECT 失败 + 状态码」，不伪造成网络超时。
4. **重试**：仅 429 与 5xx 重试，最多 3 次，优先 `Retry-After`。4xx 立即返回，避免把参数错误当抖动反复请求。
5. **剧集分页**：按 `total` 判断是否继续翻页，单页 200 条，防止长篇条目被静默截断后产出错误映射。
6. **密钥**：`apiKey` 只保存在配置对象里，不写日志、不出现在错误消息中；`isAiConfigured()` 只返回布尔值。

## 行为变化与兼容性

- 纯新增配置节与新模块，未改动任何现有接口、数据层或启动链路。
- `config.yaml` 新增两节后，`config --json` 会多出对应字段，属于预期变化。
- AI 未配置时 `isAiConfigured()` 返回 false，后续接口据此给出明确提示，不会发出必然失败的请求。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run test/server/bangumi-config.test.ts`：8 个用例通过，覆盖默认值、`.env` 覆盖、进程环境优先、空串与非法超时回退、AI 完整性判定、`.env` 解析语法。
- 未在测试中发起真实网络请求：配置与客户端分离，网络行为由后续编排层在手工验证中覆盖。

## 关联文档

- `docs/modules/server/bangumi-sync.md`（后续批次补全）
