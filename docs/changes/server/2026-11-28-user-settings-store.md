# 新增用户设置存储与接口

- 日期：2026-11-28
- 模块：server
- 类型：功能
- 涉及模块：server

## 背景

AI 接口地址、密钥、模型与 Bangumi 代理原先来自 `config.yaml` 默认值加仓库根目录 `.env`。`config.yaml` 随程序分发，安装目录通常只读且升级会覆盖；`.env` 打包进应用后一旦分享就整份泄露。开源仓库里不应存在任何个人凭据。

本批次先建立「用户设置」的存储与接口，暂不切换读取链路，保证每一步都可独立验证与回滚。

## 目标与取舍

- 设置落在**用户数据目录**（Windows `%LOCALAPPDATA%\Anime Video\settings.json`），与目录白名单同目录；卸载重装不丢，换机器不跟随。
- 复用 `Data<T>` 的防抖写盘与 `tmp + rename` 原子替换，不引入新的持久化机制。
- 接口只返回**脱敏视图**：密钥仅回显尾部四位，明文不出服务端。
- 密钥采用「缺省不改 / 空串清空 / 有值替换」三态，与「标题空值恢复默认」的约定相反，避免清空输入框误删凭据。
- 路径解析抽到 `server/src/utils/user-data-dir.ts`，与 `server/data/common.ts` 共用同一套规则，避免两份实现漂移。

## 接口

| 方法 | 路径                           | 作用                                      |
| ---- | ------------------------------ | ----------------------------------------- |
| GET  | `/data/settings`               | 返回脱敏设置与 `syncAvailable` 可用性标记 |
| PUT  | `/data/settings`               | 按补丁更新，字段级校验，保存后立即生效    |
| POST | `/data/settings/ai/probe`      | 试探 AI 接口（`/models` 失败时退回对话）  |
| POST | `/data/settings/bangumi/probe` | 试探 Bangumi 条目接口，走配置的 UA 与代理 |

## 涉及文件

| 文件                                      | 改动                               | 原因                                   |
| ----------------------------------------- | ---------------------------------- | -------------------------------------- |
| `server/src/settings/store.ts`            | 类型、默认值、读写、脱敏视图       | 设置的唯一数据入口                     |
| `server/src/settings/probe.ts`            | 两个探测函数与状态码翻译           | 失败要给出可操作的中文原因             |
| `server/src/schema/settings.ts`           | PUT 参数模式与 http(s) 校验        | 校验集中在 schema，与既有约定一致      |
| `server/controller/SettingsController.ts` | 四个端点与字段级日志               | 接口层只做注入、编排与日志             |
| `server/src/utils/user-data-dir.ts`       | 从 `data/common.ts` 抽出的路径解析 | 设置与目录白名单共用一份实现           |
| `server/data/common.ts`                   | 改为引用抽出的路径函数             | 删除重复实现，行为不变                 |
| `test/server/settings.test.ts`            | 7 个用例                           | 默认值、落盘、三态、脱敏、可用性、容错 |

## 实现要点

1. **进程内快照**：`readSettings()` 首次读盘后缓存，`updateSettings()` 写入成功后自行更新快照，调用方无需关心失效；手工改文件不会热加载，需重启。
2. **容错归一化**：只接受与默认值同类型的字段，类型不符（例如把 `timeout` 写成字符串）回退默认值，坏文件不会带崩请求。
3. **探测不做重试**：设置页是交互场景，20s 上限；`/models` 返回 400/404/405 时再试一次最小对话请求，兼容未实现 `/models` 的服务。
4. **不回显上游报文**：只把状态码翻译成提示（401/403 检查密钥、404 检查版本段、429 稍后重试），避免服务端把密钥回写到错误信息里被转发出去。
5. **日志只记字段名**：`settings.updated` 的 `fields` 是 `ai.apiKey` 这类路径，不记录任何值。

## 行为变化与兼容性

- 纯新增接口与文件，不改变现有配置读取路径：本批次结束后 `config.yaml` 与 `.env` 仍然生效。
- 新增 `settings.json` 首次读取时创建，位于用户数据目录，不进入仓库。
- `getUserDataDirectory()` 只是搬移，`data/common.ts` 的目录白名单行为不变。

## 验证

- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`：通过。
- `pnpm exec vitest run`：36 个文件 362 个用例通过（新增 7 个）。
- 接口冒烟（`ANIME_VIDEO_DATA_DIR` 指向临时目录）：GET 返回默认值与 `syncAvailable: false`；PUT 保存后文件内容正确、响应已脱敏为 `****abcd`；`baseUrl` 填 `ftp://` 返回 400；探测在连接被拒与超时两种情况下都返回中文原因。

## 关联文档

- `docs/changes/server/2026-11-27-bangumi-client-config.md`
- `docs/configuration.md`
